/**
 * 一口馬主の収支 Excel をサイト用データへ取り込む
 *
 * node scripts/import-horse-ledger.mjs
 * node scripts/import-horse-ledger.mjs --source="N:/雅フォルダHDD/一口馬主.xlsx"
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const defaultSource = 'N:/雅フォルダHDD/一口馬主.xlsx';
const outputTs = path.join(rootDir, 'src/data/horseLedger.ts');
const SHEETS = [
  { id: '6', label: '6人分', people: 6, name: '一口馬主６人分' },
  { id: '3', label: '3人分', people: 3, name: '一口馬主３人分' },
];
const YEAR_RE = /^(20\d{2})年$/;
const MONTH_COUNT = 12;
const SECTION_LABELS = new Set(['支出', '収入']);
const TOTAL_LABELS = new Set([
  '月合計',
  '集金(一人分)',
  '集金合計',
  '残金',
  '収益合計(一人分)',
  '支出計',
  '差額計',
  '賞金計',
  '一人当たりの収益合計',
]);

function cellRaw(cell) {
  if (!cell) return null;
  const value = cell.value;
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object' && value.richText) {
    return value.richText.map((part) => part.text).join('');
  }
  if (typeof value === 'object' && 'text' in value && !('formula' in value) && !('sharedFormula' in value)) {
    return value.text;
  }
  return value;
}

function cellText(cell) {
  const value = cellRaw(cell);
  if (value === null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return '';
  if (typeof value === 'string') return value.replace(/\r\n|\r|\n/g, '').trim();
  if (typeof value === 'object' && ('formula' in value || 'sharedFormula' in value)) return '';
  return String(value).trim();
}

function cellNumber(cell) {
  const value = cellRaw(cell);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object') {
    if (typeof value.result === 'number' && Number.isFinite(value.result)) return value.result;
  }
  return null;
}

function monthHeaders(row) {
  const months = [];
  for (let index = 0; index < MONTH_COUNT; index += 1) {
    const text = cellText(row.getCell(index + 3));
    const match = text.match(/^(\d{1,2})月$/);
    months.push(match ? `${Number(match[1])}月` : `${index + 1}月`);
  }
  return months;
}

function rowLabel(row) {
  const a = cellText(row.getCell(1));
  const bRaw = String(cellRaw(row.getCell(2)) ?? '');
  const b = bRaw.replace(/\r\n|\r|\n/g, '').trim();
  const yearMatch = a.match(YEAR_RE) || b.match(YEAR_RE);
  if (yearMatch) return { skip: true, year: Number(yearMatch[1]) };

  const indented = /^[　\s]/.test(bRaw);
  const compactB = b.replace(/^[　\s]+/, '');
  let label = '';
  if (a && compactB && a !== compactB) {
    label = compactB === '一人当り' || compactB === '計' ? `${a}（${compactB}）` : a;
  } else {
    label = a || compactB;
  }

  if (!label) return { skip: true };

  let depth = 0;
  if (indented) depth = 2;
  else if (!a && compactB) depth = 1;

  let kind = 'item';
  if (SECTION_LABELS.has(label)) kind = 'section';
  else if (TOTAL_LABELS.has(label) || TOTAL_LABELS.has(a) || label.includes('収益合計')) kind = 'total';
  else if (depth === 2 || compactB === '一人当り' || compactB === '計') kind = 'child';

  return { skip: false, label, depth, kind };
}

function rowValues(row) {
  const values = [];
  for (let index = 0; index < MONTH_COUNT; index += 1) {
    values.push(cellNumber(row.getCell(index + 3)));
  }
  return values;
}

function rowNotes(row) {
  const notes = [];
  for (let col = 16; col <= 18; col += 1) {
    const label = cellText(row.getCell(col));
    const value = cellNumber(row.getCell(col));
    if (label && value === null) notes.push({ label, value: null, pending: true });
    else if (!label && value !== null) notes.push({ label: '', value });
    else if (label && value !== null) notes.push({ label, value });
  }
  return notes;
}

function parseSheet(worksheet) {
  const yearRows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, number) => {
    const a = cellText(row.getCell(1));
    const match = a.match(YEAR_RE);
    if (match) yearRows.push({ year: Number(match[1]), start: number });
  });
  yearRows.sort((a, b) => a.start - b.start);

  const years = [];
  for (let index = 0; index < yearRows.length; index += 1) {
    const current = yearRows[index];
    const end = index + 1 < yearRows.length ? yearRows[index + 1].start - 1 : worksheet.rowCount;
    const header = worksheet.getRow(current.start);
    const notes = [];
    const pendingNotes = [];
    const rows = [];

    for (const note of rowNotes(header)) {
      if (note.pending) pendingNotes.push(note.label);
      else if (note.label) notes.push({ label: note.label, value: note.value });
    }

    for (let number = current.start + 1; number <= end; number += 1) {
      const row = worksheet.getRow(number);
      const parsed = rowLabel(row);
      if (parsed.skip) continue;
      if (parsed.label === '財務状況') continue;

      const extra = rowNotes(row);
      for (const note of extra) {
        if (note.pending) pendingNotes.push(note.label);
        else if (note.label) notes.push({ label: note.label, value: note.value });
        else if (pendingNotes.length) {
          notes.push({ label: pendingNotes.shift(), value: note.value });
        }
      }

      rows.push({
        label: parsed.label,
        depth: parsed.depth,
        kind: parsed.kind,
        values: rowValues(row),
      });
    }

    years.push({
      year: current.year,
      months: monthHeaders(header),
      rows,
      notes: notes.filter((note) => note.label),
    });
  }

  years.sort((a, b) => b.year - a.year);
  return years;
}

function toTypeScript(books) {
  return `// Generated by scripts/import-horse-ledger.mjs
export type LedgerCell = number | null;
export type LedgerRowKind = 'section' | 'item' | 'child' | 'total';
export type LedgerGroupId = '6' | '3';

export type LedgerRow = {
  label: string;
  depth: number;
  kind: LedgerRowKind;
  values: LedgerCell[];
};

export type LedgerNote = {
  label: string;
  value: LedgerCell;
};

export type LedgerYear = {
  year: number;
  months: string[];
  rows: LedgerRow[];
  notes: LedgerNote[];
};

export type LedgerBook = {
  id: LedgerGroupId;
  label: string;
  people: number;
  years: LedgerYear[];
};

export const ledgerBooks: LedgerBook[] = ${JSON.stringify(books, null, 2)};

export function getLedgerBook(id: string | undefined): LedgerBook | undefined {
  return ledgerBooks.find((book) => book.id === id);
}

export function getLedgerYear(id: string | undefined, year: number): LedgerYear | undefined {
  return getLedgerBook(id)?.years.find((item) => item.year === year);
}

export function latestLedgerYear(id: string | undefined): number {
  return getLedgerBook(id)?.years[0]?.year ?? 0;
}

export function ledgerPath(id: LedgerGroupId, year?: number): string {
  const book = getLedgerBook(id);
  const preferred = year && book?.years.some((item) => item.year === year) ? year : latestLedgerYear(id);
  return \`/horse/ledger/\${id}/\${preferred}\`;
}

export function formatLedgerValue(value: LedgerCell): string {
  if (value === null) return '';
  return new Intl.NumberFormat('ja-JP').format(Math.round(value));
}
`;
}

async function main() {
  const sourceArg = process.argv.find((arg) => arg.startsWith('--source='));
  const sourcePath = sourceArg ? sourceArg.slice('--source='.length) : defaultSource;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(sourcePath);
  const books = [];

  for (const sheet of SHEETS) {
    const worksheet = workbook.getWorksheet(sheet.name);
    if (!worksheet) {
      throw new Error(`sheet not found: ${sheet.name}`);
    }
    const years = parseSheet(worksheet);
    books.push({
      id: sheet.id,
      label: sheet.label,
      people: sheet.people,
      years,
    });
    console.log(`${sheet.label}: ${years.length} years`);
    for (const year of years) {
      console.log(`  ${year.year}: rows=${year.rows.length} notes=${year.notes.length}`);
    }
  }

  await fs.writeFile(outputTs, toTypeScript(books), 'utf8');
  console.log(`wrote ${outputTs}`);
}

await main();
