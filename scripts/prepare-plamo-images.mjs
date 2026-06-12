/**
 * 掲載準備: リネーム → 変換 を連続実行
 *
 * npm run plamo:prepare
 * npm run plamo:prepare -- --dry-run
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runNodeScript(scriptName, extraArgs) {
  const scriptPath = path.join(__dirname, scriptName);
  const args = [scriptPath, ...extraArgs];

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit' });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptName} failed with exit code ${code}`));
    });
  });
}

async function main() {
  const extraArgs = process.argv.slice(2);
  console.log('=== 1/2 リネーム ===');
  await runNodeScript('rename-plamo-images.mjs', extraArgs);
  console.log('');
  console.log('=== 2/2 変換 ===');
  await runNodeScript('convert-plamo-images.mjs', extraArgs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
