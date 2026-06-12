/**
 * 旧HPのプラモ画像フォルダを一括で Web 用に変換するツール
 *
 * 使い方:
 *   1. scripts/plamo-config.example.json をコピーして plamo-config.json を作成
 *   2. sourceDir に旧 img フォルダのパスを設定
 *   3. npm run plamo:convert
 *
 * オプション:
 *   npm run plamo:convert -- --dry-run          変換せずに対象だけ表示
 *   npm run plamo:convert -- --source D:/img   設定ファイルより優先
 *   npm run plamo:convert -- --force            既存ファイルも上書き
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(__dirname, 'plamo-config.json');

const PROCESSED_DIRS = ['加工した写真', 'processed', '加工'];
const ORIGINAL_DIRS = ['元画像', '元の写真', 'original'];
const IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i;

const DEFAULT_CONFIG = {
  sourceDir: '',
  outputDir: 'public/images/plamo',
  preferProcessed: true,
  galleryMaxSize: 1200,
  coverMaxSize: 600,
  quality: 82,
  skipExisting: true,
};

function parseArgs(argv) {
  const args = {
    dryRun: false,
    force: false,
    source: null,
    output: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--source') args.source = argv[++i];
    else if (arg === '--output') args.output = argv[++i];
  }

  return args;
}

function printHelp() {
  console.log(`
プラモ画像 一括変換ツール

npm run plamo:convert
npm run plamo:convert -- --dry-run
npm run plamo:convert -- --source "D:/old-hp/img" --output "public/images/plamo"
npm run plamo:convert -- --force

設定ファイル: scripts/plamo-config.json
マニフェスト出力: scripts/plamo-import-manifest.json
`);
}

async function loadConfig(cli) {
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

function toSlug(folderName) {
  return folderName
    .toLowerCase()
    .normalize('NFKC')
    .replace(/_\d+[-/]\d+$/i, '')
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function isImage(fileName) {
  return IMAGE_RE.test(fileName);
}

function sortImages(files) {
  return [...files].sort((a, b) => a.localeCompare(b, 'ja'));
}

async function listSubdirs(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function listImages(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return sortImages(entries.filter((e) => e.isFile() && isImage(e.name)).map((e) => e.name));
}

async function findImageDir(kitDir, preferProcessed) {
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

async function convertOne(inputPath, outputPath, maxSize, quality, skipExisting) {
  try {
    await fs.access(outputPath);
    if (skipExisting) {
      return { status: 'skipped', outputPath };
    }
  } catch {
    // 出力ファイルなし → 変換続行
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  await sharp(inputPath)
    .rotate()
    .resize({
      width: maxSize,
      height: maxSize,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality })
    .toFile(outputPath);

  const stat = await fs.stat(outputPath);
  return { status: 'converted', outputPath, bytes: stat.size };
}

async function processKit(kitFolderName, kitDir, config, cli) {
  const slug = toSlug(kitFolderName);
  if (!slug) {
    return { kitFolderName, slug: null, error: 'slug を生成できませんでした' };
  }

  const found = await findImageDir(kitDir, config.preferProcessed);
  if (!found) {
    return { kitFolderName, slug, error: '画像が見つかりませんでした' };
  }

  const outDir = path.join(config.outputDir, slug);
  const galleryFiles = [];
  let totalBytes = 0;
  const actions = [];

  for (let i = 0; i < found.images.length; i += 1) {
    const srcName = found.images[i];
    const index = String(i + 1).padStart(2, '0');
    const baseName = path.parse(srcName).name;
    const safeBase = baseName
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'photo';
    const outName = `${index}-${safeBase}.webp`;
    const inputPath = path.join(found.imageDir, srcName);
    const outputPath = path.join(outDir, outName);

    if (cli.dryRun) {
      actions.push({ type: 'gallery', inputPath, outputPath });
      galleryFiles.push(outName);
      continue;
    }

    const result = await convertOne(
      inputPath,
      outputPath,
      config.galleryMaxSize,
      config.quality,
      config.skipExisting,
    );
    actions.push({ type: 'gallery', ...result, inputPath });
    if (result.bytes) totalBytes += result.bytes;
    galleryFiles.push(outName);
  }

  const coverPath = path.join(outDir, 'cover.webp');
  const firstInput = path.join(found.imageDir, found.images[0]);

  if (cli.dryRun) {
    actions.push({ type: 'cover', inputPath: firstInput, outputPath: coverPath });
  } else {
    const coverResult = await convertOne(
      firstInput,
      coverPath,
      config.coverMaxSize,
      config.quality,
      config.skipExisting,
    );
    actions.push({ type: 'cover', ...coverResult, inputPath: firstInput });
    if (coverResult.bytes) totalBytes += coverResult.bytes;
  }

  return {
    kitFolderName,
    slug,
    sourceType: found.sourceType,
    imageCount: found.images.length,
    outputDir: outDir,
    cover: 'cover.webp',
    gallery: galleryFiles,
    totalBytes,
    actions,
  };
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) {
    printHelp();
    return;
  }

  const config = await loadConfig(cli);

  if (!config.sourceDir) {
    console.error('エラー: sourceDir が未設定です。');
    console.error('scripts/plamo-config.json を作成するか、--source で指定してください。');
    process.exit(1);
  }

  try {
    await fs.access(config.sourceDir);
  } catch {
    console.error(`エラー: ソースフォルダが見つかりません: ${config.sourceDir}`);
    process.exit(1);
  }

  const kitFolders = await listSubdirs(config.sourceDir);
  if (kitFolders.length === 0) {
    console.error(`エラー: キットフォルダがありません: ${config.sourceDir}`);
    process.exit(1);
  }

  console.log(`ソース: ${config.sourceDir}`);
  console.log(`出力先: ${config.outputDir}`);
  console.log(`キット数: ${kitFolders.length}`);
  if (cli.dryRun) console.log('モード: dry-run（変換しません）');
  console.log('');

  const manifest = [];
  const errors = [];
  let convertedCount = 0;
  let skippedCount = 0;
  let totalBytes = 0;

  for (const kitFolderName of kitFolders) {
    const kitDir = path.join(config.sourceDir, kitFolderName);
    const result = await processKit(kitFolderName, kitDir, config, cli);

    if (result.error) {
      errors.push(result);
      console.log(`✗ ${kitFolderName} → ${result.error}`);
      continue;
    }

    manifest.push({
      slug: result.slug,
      sourceFolder: result.kitFolderName,
      sourceType: result.sourceType,
      cover: `/images/plamo/${result.slug}/${result.cover}`,
      gallery: result.gallery.map((file) => ({
        src: `/images/plamo/${result.slug}/${file}`,
        alt: path.parse(file).name.replace(/^\d+-/, '').replace(/-/g, ' '),
      })),
    });

    if (!cli.dryRun && result.actions) {
      for (const action of result.actions) {
        if (action.status === 'converted') convertedCount += 1;
        if (action.status === 'skipped') skippedCount += 1;
      }
      totalBytes += result.totalBytes ?? 0;
    }

    console.log(
      `${cli.dryRun ? '○' : '✓'} ${kitFolderName} → ${result.slug} (${result.imageCount}枚, ${result.sourceType})`,
    );
  }

  const manifestPath = path.join(__dirname, 'plamo-import-manifest.json');
  if (!cli.dryRun) {
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }

  console.log('');
  console.log('--- 完了 ---');
  console.log(`成功: ${manifest.length} キット`);
  if (errors.length > 0) console.log(`スキップ/失敗: ${errors.length} キット`);

  if (!cli.dryRun) {
    console.log(`変換: ${convertedCount} ファイル`);
    console.log(`スキップ: ${skippedCount} ファイル（既存）`);
    console.log(`合計サイズ: ${formatBytes(totalBytes)}`);
    console.log(`マニフェスト: ${manifestPath}`);
    console.log('');
    console.log('次のステップ: plamo-import-manifest.json を参考に plamoKits.ts を更新してください。');
  } else {
    console.log('実行するには: npm run plamo:convert');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
