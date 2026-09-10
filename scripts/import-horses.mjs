/**
 * 馬プロフィール txt / jpg をサイト用データへ取り込む
 *
 * node scripts/import-horses.mjs
 * node scripts/import-horses.mjs --source "D:/HP素材/馬プロフィール"
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const defaultSource = 'D:/HP素材/馬プロフィール';
const outputTs = path.join(rootDir, 'src/data/horses.ts');
const imageOutRoot = path.join(rootDir, 'public/images/horse');

const DATE_LINE = /^(\d{2}\/\d{1,2}\/\d{1,2})(?:\s+(.*))?$/;
const WORKOUT_DATE = /^(\d{2}\/\d{1,2}\/\d{1,2})$/;
const COAT_RE = /(黒鹿毛|青鹿毛|栃栗毛|鹿毛|栗毛|芦毛|青毛|白毛)/;

function slugifyEnglish(value) {
  return value
    .normalize('NFKD')
    .replace(/[’']/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function regionStable(line) {
  const region = line.includes('関東') ? '美浦' : line.includes('関西') ? '栗東' : '';
  const trainer = line
    .replace(/^関東|^関西/, '')
    .replace(/生産.+$/, '')
    .replace(/厩舎/, '')
    .replace(/\s+/g, '')
    .trim();
  return region ? `${region}・${trainer}` : trainer;
}

function parseSex(line) {
  if (line.startsWith('騙') || line.includes('せん')) return 'せん馬';
  if (line.startsWith('牝')) return '牝馬';
  return '牡馬';
}

function parseBirthYear(line) {
  const match = line.match(/'(\d{2})\//);
  if (!match) return 0;
  const yy = Number(match[1]);
  return yy > 50 ? 1900 + yy : 2000 + yy;
}

function parseRecord(line) {
  const match = line.match(/\((\d+)\s*-\s*(\d+)\s*-\s*(\d+)\s*-\s*(\d+)\)/);
  if (match) {
    const nums = match.slice(1, 5).map(Number);
    return { starts: nums.reduce((a, b) => a + b, 0), wins: nums[0] };
  }
  return { starts: 0, wins: 0 };
}

function parsePrices(line) {
  const offering = line.match(/募集総額\s*([0-9,]+万円)/)?.[1] ?? '';
  const share = line.match(/1口出資額\s*([0-9,]+円)/)?.[1] ?? '';
  return { offeringPrice: offering, sharePrice: share };
}

function stripStar(value) {
  return value.replace(/^\*/, '').trim();
}

function parsePedigree(line) {
  const pedigree = line.match(/父(?!名)\*?(.+?)\s*×\s*母(?!名)\*?(.+?)\(BMS:(.+?)\)/);
  const sire = stripStar(pedigree?.[1] ?? '');
  const dam = stripStar(pedigree?.[2] ?? '');
  const damsire = stripStar(pedigree?.[3] ?? '');
  const nameOrigin = line
    .replace(/^.+?）\s*/, '')
    .replace(/\s*父(?!名)\*?.+$/, '')
    .replace(/[。．]\s*$/, '')
    .trim();
  const english = line.match(/^(.+?)（/)?.[1]?.trim() ?? '';
  return { sire, dam, damsire, nameOrigin, english };
}

function splitSections(text) {
  const workoutIndex = text.search(/調教日[\t 　]*騎乗者/);
  const raceIndex = text.search(/出走日[\t 　]*場所/);
  const headerAndComments = workoutIndex >= 0 ? text.slice(0, workoutIndex) : raceIndex >= 0 ? text.slice(0, raceIndex) : text;
  const workouts = workoutIndex >= 0
    ? text.slice(workoutIndex, raceIndex >= 0 ? raceIndex : undefined)
    : '';
  const races = raceIndex >= 0 ? text.slice(raceIndex) : '';
  return { headerAndComments, workouts, races };
}

function parseComments(body) {
  const lines = body.split(/\r?\n/);
  const comments = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    const raw = current.body.join('\n').trim();
    const quoteMatch = raw.match(/[「｢]([^」｣]+)[」｣](?:（([^）]+)）)?/);
    const summary = quoteMatch
      ? raw.slice(0, quoteMatch.index).replace(/\s+$/, '')
      : raw;
    comments.push({
      date: current.date,
      location: current.location,
      summary,
      quote: quoteMatch?.[1] ?? '',
      source: quoteMatch?.[2] ?? '',
    });
    current = null;
  };

  for (const line of lines) {
    const match = line.match(/^(\d{2}\/\d{1,2}\/\d{1,2})[ \t　]+(.+)$/);
    if (match) {
      flush();
      current = { date: match[1], location: match[2].trim(), body: [] };
      continue;
    }
    if (current) current.body.push(line);
  }
  flush();
  return comments;
}

function parseWorkouts(block) {
  const lines = block.split(/\r?\n/).map((line) => line.replace(/\s+$/, ''));
  const workouts = [];

  for (let i = 0; i < lines.length; i += 1) {
    const dateMatch = lines[i].match(WORKOUT_DATE);
    if (!dateMatch) continue;
    const next = lines[i + 1] ?? '';
    if (!/[（(]/.test(next)) continue;

    const weekdayMatch = next.match(/[（(]([^）)]+)[）)]/);
    const weekday = weekdayMatch?.[1] ?? '';
    const rider = next.split(/\t/)[1]?.trim() || lines[i + 2]?.trim() || '';

    let cursor = next.includes('\t') ? i + 2 : i + 3;
    const courseLine = lines[cursor] ?? '';
    if (!courseLine.includes('・') && !courseLine.includes('\t')) continue;

    const courseParts = courseLine.split(/\t/).map((part) => part.trim()).filter(Boolean);
    const [courseGoing, timesOrManner, maybeManner] = courseParts;
    const [course, going] = (courseGoing ?? '').split('・');

    let times = '';
    let comment;
    let manner = '';

    if (courseParts.length >= 3) {
      times = timesOrManner ?? '';
      manner = maybeManner ?? '';
    } else if (courseParts.length === 2 && /\d/.test(timesOrManner ?? '')) {
      times = timesOrManner;
      cursor += 1;
      const extra = (lines[cursor] ?? '').split(/\t/).map((part) => part.trim()).filter(Boolean);
      if (extra.length >= 2) {
        comment = extra[0];
        manner = extra[1];
      } else if (extra.length === 1 && !extra[0].startsWith('(') && !extra[0].startsWith('（')) {
        comment = extra[0];
        cursor += 1;
        const extra2 = (lines[cursor] ?? '').split(/\t/).map((part) => part.trim()).filter(Boolean);
        manner = extra2[0] ?? '';
      } else {
        manner = extra[0] ?? '';
      }
    } else {
      manner = timesOrManner ?? '';
    }

    cursor += 1;
    const aroundLine = lines[cursor] ?? '';
    const around = aroundLine.replace(/[()（）]/g, '').trim() || '-';

    workouts.push({
      date: dateMatch[1],
      weekday,
      rider,
      course: course ?? '',
      going: going ?? '',
      times,
      ...(comment ? { comment } : {}),
      manner,
      around,
    });
    i = cursor;
  }

  return workouts;
}

function parseRaces(block) {
  const lines = block.split(/\r?\n/).map((line) => line.replace(/\s+$/, ''));
  const races = [];
  let i = 0;
  while (i < lines.length && !/^\d{2}\/\d{1,2}\/\d{1,2}\t/.test(lines[i])) i += 1;

  while (i < lines.length) {
    const line1 = lines[i];
    if (!/^\d{2}\/\d{1,2}\/\d{1,2}\t/.test(line1)) {
      i += 1;
      continue;
    }
    const p1 = line1.split('\t');
    const p2 = (lines[i + 1] ?? '').split('\t');
    const p3 = (lines[i + 2] ?? '').split('\t');
    const p4 = (lines[i + 3] ?? '').split('\t');
    const p5 = (lines[i + 4] ?? '').split('\t');
    const p6 = (lines[i + 5] ?? '').split('\t');
    const p7 = (lines[i + 6] ?? '').split('\t');

    const marginRaw = (p7[0] ?? '').replace(/[()]/g, '');
    const note = (p7[3] ?? '').trim();

    races.push({
      date: p1[0] ?? '',
      venue: p1[1] ?? '',
      classLabel: p1[2] ?? '',
      raceName: p1[3] ?? '',
      weather: p1[4] ?? '',
      going: p2[0] ?? '',
      surface: p2[1] ?? '',
      distance: Number(p3[0]) || 0,
      raceNumber: Number(p3[1]) || 0,
      bracket: Number(p3[2]) || 0,
      horseNumber: Number(p4[0]) || 0,
      fieldSize: Number(p4[1]) || 0,
      popularity: Number(p5[0]) || 0,
      finish: String(p5[1] ?? ''),
      jockey: p5[2] ?? '',
      carriedWeight: Number(p6[0]) || 0,
      time: p6[1] ?? '',
      margin: marginRaw,
      last3f: p7[1] ?? '',
      horseWeight: Number(p7[2]) || 0,
      ...(note ? { note } : {}),
    });
    i += 7;
  }

  return races;
}

function parseHorseText(text, fileName) {
  const { headerAndComments, workouts, races } = splitSections(text);
  const lines = headerAndComments.split(/\r?\n/);
  const name = lines[0].trim();
  const metaLine = lines[1] ?? '';
  const pedigreeLine = lines.find((line) => line.includes('父') && line.includes('母') && line.includes('BMS')) ?? '';
  const stableLine = lines.find((line) => line.includes('厩舎')) ?? '';
  const priceLine = lines.find((line) => line.includes('募集総額')) ?? '';
  const recordLine = lines.find((line) => line.startsWith('平地')) ?? '';

  const { sire, dam, damsire, nameOrigin, english } = parsePedigree(pedigreeLine);
  const { offeringPrice, sharePrice } = parsePrices(priceLine);
  const record = parseRecord(recordLine);

  const commentStart = lines.findIndex((line) => DATE_LINE.test(line) && !line.includes('生'));
  const commentBody = commentStart >= 0 ? lines.slice(commentStart).join('\n') : '';
  const comments = parseComments(commentBody);
  const parsedWorkouts = parseWorkouts(workouts);
  const parsedRaces = parseRaces(races);

  if (record.starts === 0 && parsedRaces.length > 0) {
    record.starts = parsedRaces.length;
    record.wins = parsedRaces.filter((race) => race.finish === '1').length;
  }

  const first = comments[0];
  const status = first?.location?.includes('引退') ? '引退' : '現役';

  return {
    slug: slugifyEnglish(english) || slugifyEnglish(fileName),
    name,
    status,
    sex: parseSex(metaLine),
    sire,
    dam,
    damsire,
    birthYear: parseBirthYear(metaLine),
    coatColor: metaLine.match(COAT_RE)?.[1] ?? '',
    nameOrigin,
    stable: regionStable(stableLine),
    offeringPrice,
    sharePrice,
    record,
    updatedAt: first?.date ?? '',
    photo: '',
    comments,
    workouts: parsedWorkouts,
    races: parsedRaces,
    _english: english,
    _file: fileName,
  };
}

function compareUpdatedAt(a, b) {
  const toKey = (value) => {
    const [y, m, d] = value.split('/').map((part) => Number(part));
    return (y + (y > 50 ? 1900 : 2000)) * 10000 + m * 100 + d;
  };
  return toKey(b) - toKey(a);
}

function toTypeScript(horses) {
  const serializable = horses.map((horse) => {
    const { _english, _file, ...rest } = horse;
    return rest;
  });

  return `// Generated by scripts/import-horses.mjs
export type HorseStatus = '現役' | '引退';
export type HorseSex = '牡馬' | '牝馬' | 'せん馬';

export type ConditionComment = {
  date: string;
  location: string;
  summary: string;
  quote: string;
  source: string;
};

export type Workout = {
  date: string;
  weekday: string;
  rider: string;
  course: string;
  going: string;
  times: string;
  comment?: string;
  manner: string;
  around: string;
};

export type RaceResult = {
  date: string;
  venue: string;
  classLabel: string;
  raceName: string;
  weather: string;
  going: string;
  surface: string;
  distance: number;
  raceNumber: number;
  bracket: number;
  horseNumber: number;
  fieldSize: number;
  popularity: number;
  finish: string;
  jockey: string;
  carriedWeight: number;
  time: string;
  margin: string;
  last3f: string;
  horseWeight: number;
  note?: string;
};

export type Horse = {
  slug: string;
  name: string;
  status: HorseStatus;
  sex: HorseSex;
  sire: string;
  dam: string;
  damsire: string;
  birthYear: number;
  coatColor: string;
  nameOrigin: string;
  stable: string;
  offeringPrice: string;
  sharePrice: string;
  record: {
    starts: number;
    wins: number;
  };
  updatedAt: string;
  photo: string;
  comments: ConditionComment[];
  workouts: Workout[];
  races: RaceResult[];
};

export function formatRecord(horse: Horse): string {
  return \`\${horse.record.starts}戦\${horse.record.wins}勝\`;
}

export function formatDam(horse: Horse): string {
  return \`\${horse.dam}（\${horse.damsire}）\`;
}

function updatedAtKey(value: string): number {
  const [year, month, day] = value.split('/').map(Number);
  return (year + (year > 50 ? 1900 : 2000)) * 10000 + (month || 0) * 100 + (day || 0);
}

export function horsesByStatus(status: HorseStatus): Horse[] {
  return horses
    .filter((horse) => horse.status === status)
    .slice()
    .sort((a, b) => updatedAtKey(b.updatedAt) - updatedAtKey(a.updatedAt));
}

export const horses: Horse[] = ${JSON.stringify(serializable, null, 2)};
`;
}

async function convertPhoto(sourceJpg, slug) {
  const outDir = path.join(imageOutRoot, slug);
  const outPath = path.join(outDir, 'cover.webp');
  await fs.mkdir(outDir, { recursive: true });
  await sharp(sourceJpg)
    .rotate()
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(outPath);
  return `/images/horse/${slug}/cover.webp`;
}

async function main() {
  const sourceArg = process.argv.find((arg) => arg.startsWith('--source='));
  const sourceDir = sourceArg ? sourceArg.slice('--source='.length) : defaultSource;
  const files = (await fs.readdir(sourceDir)).filter((name) => name.endsWith('.txt'));
  const horses = [];

  for (const file of files) {
    const base = file.replace(/\.txt$/i, '');
    const txtPath = path.join(sourceDir, file);
    const text = new TextDecoder('shift_jis').decode(await fs.readFile(txtPath));
    const horse = parseHorseText(text, base);
    const jpgPath = path.join(sourceDir, `${base}.jpg`);
    try {
      horse.photo = await convertPhoto(jpgPath, horse.slug);
    } catch (error) {
      console.warn(`photo skip ${base}:`, error.message);
      horse.photo = '';
    }
    horses.push(horse);
    console.log(
      `${horse.name} [${horse.slug}] ${horse.status} ${horse.sex} ${horse.coatColor} ${horse.birthYear} ` +
        `${horse.record.starts}戦${horse.record.wins}勝 comments=${horse.comments.length} ` +
        `workouts=${horse.workouts.length} races=${horse.races.length}`,
    );
    if (!horse.sire || !horse.dam) console.warn('  missing pedigree');
    if (!horse.offeringPrice) console.warn('  missing price');
  }

  horses.sort((a, b) => {
    if (a.status !== b.status) return a.status === '現役' ? -1 : 1;
    return compareUpdatedAt(a.updatedAt, b.updatedAt);
  });

  await fs.writeFile(outputTs, toTypeScript(horses), 'utf8');
  console.log(`wrote ${outputTs} (${horses.length} horses)`);
}

await main();
