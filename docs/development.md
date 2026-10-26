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
- 一覧への登録は [src/games.ts](../src/games.ts)、カードの図案は [src/box.ts](../src/box.ts) で管理します。
- 各遊びにREADMEを用意し、遊び方・状態の扱い・実装上の注意・素材の出典へのリンク・固有の確認項目を記載します。
- `../` への戻るリンク、終了・非表示時の音声と入力の後始末、共有画像・faviconを備えます。anipopina.comへのリンクは入口ページのフッターに置き、遊び個別のページには不要です。操作寸法などは [AGENTS.md](../AGENTS.md) に従います。
- 画像・音声は `import imageUrl from './assets/image.webp'` のように参照し、`image.src = imageUrl` や `fetch(audioUrl)` に渡します。CSSの `url()` とHTMLの画像参照もViteが処理し、公開用にはハッシュ付きファイル名を付けます。
- 固定URLが必要な素材は `src/public/` に置き、`/favicon.ico` のように参照します。ビルド時に `dist/` 直下へコピーされます。
- 共有キャラクターSVGは `src/assets/characters/<series>/` に置き、出典とSHA-256は `source-assets/characters/` に記録します。原本SVGを整形・最適化せず、ゲームへの採用は別途判断します。
- 素材原本と出典・変換記録は `source-assets/<slug>/` に保存します。`dist/` を直接編集しません。

## ブラウザーテスト

既存のChromium / DevTools Protocolのテストを使います。Linuxでの既定の実行ファイルは `/usr/bin/chromium` です。異なる場合は絶対パスを指定します。

```sh
CHROME_PATH=/path/to/chromium npm test
```

`npm test` はビルド、[出力検査](../tests/build.mjs)、[ブランド素材検査](../tests/branding.mjs)、[シリーズ別SVGの原本一致検査](../tests/characters.mjs)、[ブラウザーテスト](../tests/browser.mjs) に加え、[風船](../tests/balloon.mjs)・[スタンプ](../tests/stamp.mjs)・[すべりだい](../tests/slide.mjs)・[風車](../tests/pinwheel.mjs)・[いろガラス](../tests/glass.mjs)の専用テストを実行します。結果とスクリーンショットは `test-results/` に保存します。

専用一時プロファイルと自動選択ポートを使い、終了時にブラウザーとHTTPサーバーを停止します。ヘッドレス検証では `--no-sandbox` を指定するため、対象はこのローカルコードだけにしてください。エミュレーションとは別に、実機iPhone/iPadのSafari、OSジェスチャー、音の聴感も確認します。

### テスト用ビルド

公開用の `dist/` では、入口・各ゲームの基本操作と素材参照を検証します。内部状態を確認する詳細な回帰テストには、`npm run build:test` で作る `test-results/build/` を使います。

テストモードに限り、[Vite設定](../vite.config.ts) が [hikari-hook.js](../tests/fixtures/hikari-hook.js) を描画ゲームのクロージャー内へ挿入してからコンパイルします。挿入箇所が変わるとビルドを失敗させます。公開用への混入は出力検査で検出します。`test-results/` は公開対象に含めません。

## 共通の音・振動設定

`src/shared/settings.ts` に集約します。UIはトップページのみで、遊び側は `getPlaySettings()` と `onPlaySettings()` を使用します。キーは `omochabox-play-settings-v1`、値は `{sound: boolean, vibration: boolean}`。初期値は両方true。直リンクでも保存値を読み、storageイベント、pageshow、focus、表示復帰で再確認します。無効な項目は既定値へ戻し、保存が拒否される環境ではページ内メモリで継続し、トップに保存できない旨を表示します。音声再開は各ゲームの次の操作から行います。

スタンプの粒子・音・触覚の上限と対応状況は [スタンプREADME](../src/ponpon-stamp/README.md#配置フィードバック) を参照してください。
