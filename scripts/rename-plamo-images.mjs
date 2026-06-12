/**
 * プラモ写真を 001_{フォルダ名}.jpg 形式に一括リネーム
 *
 * npm run plamo:rename
 * npm run plamo:rename -- --dry-run
 * npm run plamo:rename -- --source "D:/プラモ写真"
 * npm run plamo:rename -- --force   # 既に命名済みでも再実行
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildRenamedFileName,
  findImageDir,
  isAlreadyRenamed,
  listSubdirs,
  loadConfig,
  parseCommonArgs,
} from './plamo-lib.mjs';

function printHelp() {
  console.log(`
プラモ写真 一括リネーム

命名規則: 001_{キットフォルダ名}.jpg（連番は3桁）

npm run plamo:rename
npm run plamo:rename -- --dry-run
npm run plamo:rename -- --source "D:/プラモ写真"
npm run plamo:rename -- --force

掲載前の準備（リネーム→変換）:
npm run plamo:prepare
`);
}

async function renameKitImages(kitFolderName, kitDir, config, cli) {
  const found = await findImageDir(kitDir, config.preferProcessed);
  if (!found) {
    return { kitFolderName, error: '画像が見つかりませんでした' };
  }

  const digits = config.renameDigits ?? 3;
  const images = found.images;

  if (!cli.force && isAlreadyRenamed(images, kitFolderName, digits)) {
    return {
      kitFolderName,
      imageCount: images.length,
      sourceType: found.sourceType,
      status: 'skipped',
      reason: '命名済み',
    };
  }

  const plans = images.map((name, index) => ({
    from: name,
    to: buildRenamedFileName(index, kitFolderName, name, digits),
  }));

  const actions = [];

  if (cli.dryRun) {
    for (const plan of plans) {
      if (plan.from !== plan.to) {
        actions.push({ from: plan.from, to: plan.to, status: 'planned' });
      }
    }
    return {
      kitFolderName,
      imageCount: images.length,
      sourceType: found.sourceType,
      status: 'dry-run',
      actions,
    };
  }

  const tempPlans = plans.map((plan, index) => ({
    from: plan.from,
    temp: `__plamo_tmp_${index}__${path.extname(plan.from)}`,
    to: plan.to,
  }));

  for (const plan of tempPlans) {
    if (plan.from === plan.to) continue;
    const fromPath = path.join(found.imageDir, plan.from);
    const tempPath = path.join(found.imageDir, plan.temp);
    await fs.rename(fromPath, tempPath);
    actions.push({ from: plan.from, to: plan.temp, status: 'temp' });
  }

  for (const plan of tempPlans) {
    if (plan.from === plan.to) continue;
    const tempPath = path.join(found.imageDir, plan.temp);
    const toPath = path.join(found.imageDir, plan.to);
    await fs.rename(tempPath, toPath);
    actions.push({ from: plan.temp, to: plan.to, status: 'renamed' });
  }

  return {
    kitFolderName,
    imageCount: images.length,
    sourceType: found.sourceType,
    status: 'renamed',
    actions: actions.filter((a) => a.status === 'renamed'),
  };
}

async function main() {
  const cli = parseCommonArgs(process.argv.slice(2));
  if (cli.help) {
    printHelp();
    return;
  }

  const config = await loadConfig(cli);

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
  console.log(`命名規則: 001_{フォルダ名}.jpg`);
  console.log(`キット数: ${kitFolders.length}`);
  if (cli.dryRun) console.log('モード: dry-run（リネームしません）');
  console.log('');

  let renamedKits = 0;
  let skippedKits = 0;
  let errorKits = 0;
  let renamedFiles = 0;

  for (const kitFolderName of kitFolders) {
    const kitDir = path.join(config.sourceDir, kitFolderName);
    const result = await renameKitImages(kitFolderName, kitDir, config, cli);

    if (result.error) {
      errorKits += 1;
      console.log(`✗ ${kitFolderName} → ${result.error}`);
      continue;
    }

    if (result.status === 'skipped') {
      skippedKits += 1;
      console.log(`○ ${kitFolderName} → スキップ（命名済み, ${result.imageCount}枚）`);
      continue;
    }

    renamedKits += 1;
    renamedFiles += result.actions?.length ?? 0;

    if (cli.dryRun) {
      const changes = result.actions?.length ?? 0;
      console.log(`○ ${kitFolderName} → ${changes}件リネーム予定（${result.imageCount}枚）`);
      for (const action of result.actions ?? []) {
        console.log(`    ${action.from} → ${action.to}`);
      }
    } else {
      console.log(`✓ ${kitFolderName} → ${result.actions?.length ?? 0}件リネーム（${result.imageCount}枚）`);
    }
  }

  console.log('');
  console.log('--- 完了 ---');
  console.log(`リネーム: ${renamedKits} キット`);
  console.log(`スキップ: ${skippedKits} キット`);
  if (errorKits > 0) console.log(`失敗: ${errorKits} キット`);
  if (!cli.dryRun) console.log(`変更ファイル数: ${renamedFiles}`);
  if (cli.dryRun) console.log('実行するには: npm run plamo:rename');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
