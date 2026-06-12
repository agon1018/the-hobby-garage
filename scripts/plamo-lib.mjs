import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const CONFIG_PATH = path.join(__dirname, 'plamo-config.json');

export const PROCESSED_DIRS = ['加工した写真', 'processed', '加工'];
export const ORIGINAL_DIRS = ['元画像', '元の写真', 'original'];
export const IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i;

export const DEFAULT_CONFIG = {
  sourceDir: 'D:/プラモ写真',
  outputDir: 'public/images/plamo',
  preferProcessed: true,
  galleryMaxSize: 1200,
  coverMaxSize: 600,
  quality: 82,
  skipExisting: true,
  renameDigits: 3,
};

export function parseCommonArgs(argv) {
  const args = {
    dryRun: false,
    force: false,
    source: null,
    output: null,
    help: false,
    rename: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--source') args.source = argv[++i];
    else if (arg === '--output') args.output = argv[++i];
    else if (arg === '--rename') args.rename = true;
  }

  return args;
}

export async function loadConfig(cli) {
  let config = { ...DEFAULT_CONFIG };

  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    config = { ...config, ...JSON.parse(raw) };
  } catch {
    // 設定ファイルがなくても CLI 引数で実行可能
  }

  if (cli.source) config.sourceDir = cli.source;
  if (cli.output) config.outputDir = cli.output;
  if (cli.force) config.skipExisting = false;

  config.outputDir = path.resolve(ROOT, config.outputDir);
  config.sourceDir = path.resolve(config.sourceDir);

  return config;
}

export function toSlug(folderName) {
  return folderName
    .toLowerCase()
    .normalize('NFKC')
    .replace(/_\d+[-/]\d+$/i, '')
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function isImage(fileName) {
  return IMAGE_RE.test(fileName);
}

export function sortImages(files) {
  return [...files].sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }));
}

export async function listSubdirs(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

export async function listImages(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return sortImages(entries.filter((e) => e.isFile() && isImage(e.name)).map((e) => e.name));
}

export async function findImageDir(kitDir, preferProcessed) {
  const entries = await fs.readdir(kitDir, { withFileTypes: true });
  const dirNames = new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));

  const searchOrder = preferProcessed
    ? [...PROCESSED_DIRS, ...ORIGINAL_DIRS]
    : [...ORIGINAL_DIRS, ...PROCESSED_DIRS];

  for (const name of searchOrder) {
    if (dirNames.has(name)) {
      const imageDir = path.join(kitDir, name);
      const images = await listImages(imageDir);
      if (images.length > 0) {
        return { imageDir, images, sourceType: name };
      }
    }
  }

  const rootImages = entries.filter((e) => e.isFile() && isImage(e.name)).map((e) => e.name);
  if (rootImages.length > 0) {
    return { imageDir: kitDir, images: sortImages(rootImages), sourceType: 'root' };
  }

  return null;
}

export function buildRenamedFileName(index, folderName, sourceFileName, digits = 3) {
  const num = String(index + 1).padStart(digits, '0');
  const ext = path.extname(sourceFileName).toLowerCase() || '.jpg';
  return `${num}_${folderName}${ext}`;
}

export function isAlreadyRenamed(images, folderName, digits = 3) {
  if (images.length === 0) return true;

  return images.every((name, index) => {
    const expected = buildRenamedFileName(index, folderName, name, digits);
    return name.toLowerCase() === expected.toLowerCase();
  });
}
