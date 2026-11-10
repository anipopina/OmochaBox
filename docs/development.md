# 開発ガイド

環境構築と基本コマンドは [全体README](../README.md)、共通の制作方針は [AGENTS.md](../AGENTS.md) を参照してください。

## 編集と検査

`src/` を編集します。Viteの開発サーバーではCSSが即時反映され、通常のTypeScriptの変更はページを再読み込みするため、遊びの状態も初期化されます。

| コマンド                                  | 内容                         |
| ----------------------------------------- | ---------------------------- |
| `npm run typecheck`                       | アプリとVite設定の型チェック |
| `npm run lint` / `npm run lint:fix`       | ESLintによる検査／自動修正   |
| `npm run format` / `npm run format:check` | Prettierによる整形／確認     |
| `npm run check`                           | 上記3種類の検査              |

Vite自体は型チェックを行いません。`npm run build` は型チェックを通してから `dist/` に出力します。
依存関係は `package-lock.json` で固定し、環境構築には `npm ci` を使います。

VS Codeの推奨拡張はESLintとPrettierです。設定は [.vscode/](../.vscode/) にあります。原本の `source-assets/`、検証資料の `docs/`、`AGENTS.md`、生成物は一括整形の対象外です。

## ページと素材の追加

- 遊びは独立したページとし、`src/<slug>/index.html` に `<script type="module" src="app.ts"></script>` を記載します。ViteがHTMLを自動検出します。
- 一覧への登録は [src/games.json](../src/games.json)、カードの図案は `src/previews/<slug>.ts` で管理します。本番公開の選択は [config/production-games.json](../config/production-games.json)、AWSの手順は [infra/README.md](../infra/README.md) を参照してください。
- 各遊びにREADMEを用意し、遊び方・状態の扱い・実装上の注意・素材の出典へのリンク・固有の確認項目を記載します。
- `../` への戻るリンク、終了・非表示時の音声と入力の後始末、共有画像・faviconを備えます。anipopina.comへのリンクは入口ページのフッターに置き、遊び個別のページには不要です。操作寸法などは [AGENTS.md](../AGENTS.md) に従います。
- 画像・音声は `import imageUrl from './assets/image.webp'` のように参照し、`image.src = imageUrl` や `fetch(audioUrl)` に渡します。CSSの `url()` とHTMLの画像参照もViteが処理し、公開用にはハッシュ付きファイル名を付けます。
- 固定URLが必要な素材は `src/public/` に置き、`/favicon.ico` のように参照します。ビルド時に `dist/` 直下へコピーされます。
- 共有キャラクターSVGは `src/assets/characters/<series>/` に置き、出典とSHA-256は `source-assets/characters/` に記録します。原本SVGを整形・最適化せず、ゲームへの採用は別途判断します。
- 素材原本と出典・利用条件・変換記録は `source-assets/<slug>/` に保存します。確認すべき利用条件は [AGENTS.md](../AGENTS.md) を参照してください。`dist/` を直接編集しません。

## ブラウザーテスト

既存のChromium / DevTools Protocolのテストを使います。Linuxでの既定の実行ファイルは `/usr/bin/chromium` です。異なる場合は絶対パスを指定します。

```sh
CHROME_PATH=/path/to/chromium npm test
```

### 検証範囲の選び方

| 変更・目的 | 実施する検証 |
| --- | --- |
| 毎日の遊び追加・個別修正 | `npm run check` と `npm run test:toy -- <slug>`。対象の独立した実画面レビューも行う |
| テスト運用スクリプトだけの変更 | `npm run check`、`npm run test:runner` と変更に対応する代表テスト。全体回帰の反復は不要 |
| 入口の一覧・遷移 | `npm run check` と `npm run test:smoke` |
| 共通の戻るボタン | `npm run check`、`npm run build`、`npm run test:home-button`（全作品・3画面サイズ） |
| その他の共通処理 | 依存する遊びを `test:toy -- <slug1> <slug2>` で指定し、変更内容に応じた確認を追加 |
| 広範囲の依存・Vite・共通基盤、影響不明、横断的な問題、AWS本番へのまとめ反映前 | `npm run check` と `npm run test:full` |

`npm test` は `test:smoke` の別名です。日常の追加に無関係な作品の詳細回帰・AWS用ビルドは必須にしません。Sitesは全作品を公開する検証環境です。無関係な既知の失敗は新作の公開ゲートにせず、対象・理由・未確認事項を報告します。対象の失敗や真の共通回帰は解消または明示し、未確認を成功扱いにしません。定期実行は設定していません。

### 実行コマンドと対象対応表

```sh
npm run test:list
npm run test:toy -- pitatto-magnet
npm run test:smoke -- pitatto-magnet
npm run test:full
npm run test:runner
```

`test:toy` は通常ビルド・出力素材検査、対象の入口から開く・戻る・再入場・初期素材読み込み、対象のモデル／ブラウザー詳細検査を実行します。`test:smoke` は通常ビルド・出力素材検査と軽い往復確認だけで、省略時は全作品、slug指定時は対象作品を確認します。共通確認は1画面サイズで実行し、各作品の詳細操作や音の聴感を保証するものではありません。変更した操作で後から読む素材は詳細検査と実画面レビューで確認します。

対応表の正本は [tests/test-plan.mjs](../tests/test-plan.mjs) で、`test:list` から表示できます。新作は [src/games.json](../src/games.json) と対応表の両方に登録します。未登録・誤記・不要な引数はエラーになります。既存の `browser.mjs` はおえかきと窓、`toy-interactions.mjs` はいろガラスとみずたまりを含むため、これらの組合せは一緒に検証します。`stamp.mjs` に残るおえかきの設定非依存確認も維持しています。おえかき・窓の詳細検査にはテスト用ビルドも作ります。各単体スクリプトは従来どおり直接実行できますが、必要なビルドを先に用意してください。

`test:full` は通常・AWS・テスト用ビルド、公開範囲・インフラ・素材、全作品の詳細検査を実行します。各検査の失敗後も独立した検査を続け、結果と秒数を一覧表示します。前提ビルドが失敗した検査は古い出力で実行せず `SKIP` にします。`FAIL` または `SKIP` があれば終了コードは非ゼロです。集約結果は `test-results/<toy|smoke|full>-summary.json`、既存の結果・スクリーンショットも `test-results/` に保存します。同じ作業場所で複数の実行を重ねないでください。運用スクリプト自体は `test:runner` の小さな検査で、選択範囲・引数検証・失敗継続・依存スキップを確認できます。

専用一時プロファイルと自動選択ポートを使い、終了時にブラウザーとHTTPサーバーを停止します。ヘッドレス検証では `--no-sandbox` を指定するため、対象はこのローカルコードだけにしてください。エミュレーションとは別に、実機iPhone/iPadのSafari、OSジェスチャー、音の聴感も確認します。

見た目・操作を変更した場合は、通常時と「動きを減らす」設定時の操作結果、およびページ終了・非表示・復帰時の入力・音声・描画の後始末を、変更に応じて確認します。検証結果の報告方法は [AGENTS.md](../AGENTS.md) に従います。

### テスト用ビルド

公開用の `dist/` では、入口・各ゲームの基本操作と素材参照を検証します。内部状態を確認する詳細な回帰テストには、`npm run build:test` で作る `test-results/build/` を使います。

テストモードに限り、[Vite設定](../vite.config.ts) が [hikari-hook.js](../tests/fixtures/hikari-hook.js) を描画ゲームのクロージャー内へ挿入してからコンパイルします。挿入箇所が変わるとビルドを失敗させます。公開用への混入は出力検査で検出します。`test-results/` は公開対象に含めません。

## 音と振動

音と振動は常時有効で、設定UI・ブラウザストレージへの保存はありません。音量・消音は端末やブラウザで調整します。

スタンプの粒子・音・触覚の上限と対応状況は [スタンプREADME](../src/ponpon-stamp/README.md#配置フィードバック) を参照してください。
