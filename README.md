# Astro Starter Kit: Basics

```sh
npm create astro@latest -- --template basics
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
│   └── favicon.svg
├── src
│   ├── assets
│   │   └── astro.svg
│   ├── components
│   │   └── Welcome.astro
│   ├── layouts
│   │   └── Layout.astro
│   └── pages
│       └── index.astro
└── package.json
```

To learn more about the folder structure of an Astro project, refer to [our guide on project structure](https://docs.astro.build/en/basics/project-structure/).

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).

## 鍵付きページ

`/horse` と `/private` 以下のHTMLは、通常の本番ビルド時にStaticryptで暗号化されます。

1. `.env.example` を参考に、ローカルの `.env` とVercelの環境変数へ
   `STATICRYPT_HORSE_PASSWORD` と `STATICRYPT_PRIVATE_PASSWORD` を設定する
2. 16文字以上の、辞書にない十分長いパスワードを使用する
3. `npm run build` でAstroのビルドと暗号化を続けて実行する

`npm run dev` と `npm run build:plain` は編集確認用のため暗号化されません。本番公開には
必ず `npm run build` を使用してください。`.staticrypt.json` は複数ページで「記憶する」を
共有するために必要なので削除しないでください。
