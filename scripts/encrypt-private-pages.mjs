import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(rootDir, 'dist');
const rememberDurationInDays = 30;
const privateRooms = [
  {
    directory: join(distDir, 'horse'),
    title: '競馬の部屋',
    envName: 'STATICRYPT_HORSE_PASSWORD',
    storagePrefix: 'staticrypt_horse',
    legacyPassword: process.env.PUBLIC_HORSE_ROOM_PASSWORD?.trim(),
  },
  {
    directory: join(distDir, 'private'),
    title: 'プライベートの部屋',
    envName: 'STATICRYPT_PRIVATE_PASSWORD',
    storagePrefix: 'staticrypt_private',
  },
];

const missingVariables = privateRooms
  .filter((room) => !(process.env[room.envName]?.trim() || room.legacyPassword))
  .map((room) => room.envName);

if (missingVariables.length > 0) {
  console.error(
    `${missingVariables.join(', ')} が未設定です。暗号化されていないページを公開しないため、ビルドを中止します。`,
  );
  process.exit(1);
}

if (!process.env.STATICRYPT_HORSE_PASSWORD && process.env.PUBLIC_HORSE_ROOM_PASSWORD) {
  console.warn(
    'PUBLIC_HORSE_ROOM_PASSWORD は移行用として使用しました。Vercelでは STATICRYPT_HORSE_PASSWORD に変更してください。',
  );
}

function collectHtmlFiles(directory) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectHtmlFiles(path);
    return entry.isFile() && entry.name.endsWith('.html') ? [path] : [];
  });
}

let encryptedCount = 0;

for (const room of privateRooms) {
  const password = process.env[room.envName]?.trim() || room.legacyPassword;
  const htmlFiles = collectHtmlFiles(room.directory);

  for (const htmlFile of htmlFiles) {
    const result = spawnSync(
      process.execPath,
      [
        join(rootDir, 'node_modules', 'staticrypt', 'cli', 'index.js'),
        htmlFile,
        '--directory',
        dirname(htmlFile),
        '--remember',
        String(rememberDurationInDays),
        '--short',
        '--template-title',
        room.title,
        '--template-instructions',
        'この部屋はパスワードで保護しています。',
        '--template-placeholder',
        'パスワード',
        '--template-button',
        '入室する',
        '--template-error',
        'パスワードが違います。',
        '--template-remember',
        'この端末で最終アクセスから30日間記憶する',
        '--template-toggle-show',
        'パスワードを表示',
        '--template-toggle-hide',
        'パスワードを隠す',
        '--template-color-primary',
        '#16824a',
        '--template-color-secondary',
        '#f6fbf7',
      ],
      {
        cwd: rootDir,
        env: { ...process.env, STATICRYPT_PASSWORD: password },
        stdio: 'inherit',
      },
    );

    if (result.status !== 0) {
      console.error(`暗号化に失敗しました: ${htmlFile}`);
      process.exit(result.status ?? 1);
    }

    const encryptedHtml = readFileSync(htmlFile, 'utf8')
      .replaceAll('staticrypt_expiration', `${room.storagePrefix}_expiration`)
      .replaceAll('staticrypt_passphrase', `${room.storagePrefix}_passphrase`)
      .replace(
        'id="staticrypt-remember" type="checkbox" name="remember" />',
        'id="staticrypt-remember" type="checkbox" name="remember" checked />',
      )
      .replace(
        'const { isSuccessful } = await staticrypt.handleDecryptOnLoad();',
        `const { isSuccessful } = await staticrypt.handleDecryptOnLoad();

                // Extend the remembered login from the latest successful access.
                if (isSuccessful) {
                    localStorage.setItem(
                        "${room.storagePrefix}_expiration",
                        (Date.now() + ${rememberDurationInDays} * 24 * 60 * 60 * 1000).toString()
                    );
                }`,
      );
    writeFileSync(
      htmlFile,
      encryptedHtml.replace(
        '<meta name="viewport" content="width=device-width, initial-scale=1" />',
        '<meta name="viewport" content="width=device-width, initial-scale=1" />\n        <meta name="robots" content="noindex, nofollow" />',
      ),
    );

    encryptedCount += 1;
  }
}

console.log(`鍵付きページ ${encryptedCount} ファイルをAES-256で暗号化しました。`);
