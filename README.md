# おもちゃボックス

幼児が触ったり、なぞったりして楽しめる、小さな遊びを集めたWebサイトです。
HTML・CSS・TypeScriptで作り、Viteで静的ファイルにビルドします。

## 遊び

| 遊び                                               | 内容                                         |
| -------------------------------------------------- | -------------------------------------------- |
| [ひかりのおえかき](src/hikari-no-oekaki/README.md) | 指先から光の花や道が生まれるおえかき         |
| [ふきふき、まど](src/fukifuki-mado/README.md)      | 曇った窓を拭いて、庭のどうぶつを見つける遊び |

| [ぷかぷか、ふうせん](src/pukapuka-fusen/README.md) | ポンプでふくらませ、空へ見送る風船遊び |

## 開発を始める

Node.js 24を推奨します。対応範囲は22.13以降の22系、または24以降です。

```sh
npm ci
npm run dev
# http://127.0.0.1:4173
```

`src/` を編集するとブラウザーへ反映されます。

| コマンド          | 用途                                |
| ----------------- | ----------------------------------- |
| `npm run dev`     | 開発サーバー                        |
| `npm run check`   | 型・ESLint・整形の検査              |
| `npm run format`  | Prettierで整形                      |
| `npm run build`   | 型チェックと公開用ビルド（`dist/`） |
| `npm run preview` | ビルド結果のローカル確認            |
| `npm test`        | ビルド出力・素材・ブラウザーの検証  |

ブラウザーテストにはChromiumが必要です。実行ファイルの指定方法や個別の検査コマンドは [開発ガイド](docs/development.md) を参照してください。

## ディレクトリ構成

```text
src/
  index.html, box.ts, box.css  遊びを選ぶ入口
  games.ts                    遊びの一覧
  <slug>/                     遊びごとの実装・素材・README
  shared/                     共通処理
  public/                     固定URLで配信するアイコン・共有画像
source-assets/                素材原本・出典・変換記録
tests/                        自動テスト
docs/                         開発資料・過去の検証記録
```

## 遊びを追加する

1. `src/<slug>/` に `index.html`・`app.ts`・`style.css`・`README.md` と必要な素材を追加します。
2. `src/games.ts` に遊びを登録し、`src/box.ts` にカードの図案を追加します。
3. 遊び固有の検証と入口からの往復を確認し、`npm run check` と `npm test` を実行します。

HTMLはビルド時に自動検出され、`/<slug>/` で開けます。素材の参照方法やページの共通要件は [開発ガイド](docs/development.md) を参照してください。

## 方針と資料

- [AGENTS.md](AGENTS.md)：幼児向けの視認性・操作・演出、素材利用の共通方針
- [キャラクターと共有素材](docs/branding.md)：なかまたち・favicon・OGPの仕様と出典
- [資料一覧](docs/README.md)：開発資料と過去の検証記録

各遊びのREADMEには現在の仕様と固有の注意点を記載します。素材の詳細な出典は `source-assets/`、過去の実装・検証報告は `docs/` に保存します。

## 公開

公開先は [おもちゃボックス（Sites）](https://omochabox.ryonchibi.chatgpt.site/) です。
`npm run build` の出力 `dist/` を、[.openai/hosting.json](.openai/hosting.json) に記録された既存Sitesプロジェクトへソース同期・バージョン保存・デプロイします。
