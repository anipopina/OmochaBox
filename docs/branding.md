# キャラクターと共有素材

共通の視認性・操作・素材利用の方針は [AGENTS.md](../AGENTS.md) を参照してください。

## なかまたち

- 四角・丸・星などのシンプルな図形を基本にします。名前や人数は固定せず、場面に合わせて色や形を調整できます。
- 手足は状況に応じて出し入れできます。出す場合は手が最大2本、足が最大2本。しっぽは付けません。
- faviconには、手足と外側の黒枠がない四角いなかまを使います。視線は少しだけ正面からずらし、余白を詰めた構図にします。

## 共通のファイル

入口と各ゲームで同じ共有画像・favicon・apple-touch-iconを参照します。[src/public/](../src/public/) の内容は固定ファイル名のまま配信します。

| 素材            | ファイルと仕様                                                |
| --------------- | ------------------------------------------------------------- |
| OGP             | `assets/branding/ogp.png`：1200×630 PNG                       |
| favicon PNG     | `favicon-16x16.png`・`favicon-32x32.png`・`favicon-48x48.png` |
| favicon ICO     | `favicon.ico`：16／32／48pxのフレーム                         |
| Apple用アイコン | `apple-touch-icon.png`：180×180の不透明PNG                    |

各HTMLのOGP画像は絶対URLで指定します。公開先を変更する場合は、入口と各ゲームのOGP URLも更新します。
検査はリポジトリ直下で `npm run build`、`node tests/branding.mjs` を実行します。

## 出典

これらは本プロジェクト向けにOpenAIの画像生成で制作し、ユーザーが選定・承認した素材です。原本・出典・変換記録は [source-assets/branding/](../source-assets/branding/) と [provenance.json](../source-assets/branding/provenance.json) に集約しています。

第三者のストック素材は使用していません。第三者ライセンスや排他的な権利保証は推定しません。

## トップページのキャラクターSVG

[src/assets/characters/](../src/assets/characters/) の6点はユーザー提供のSVGです。画像生成で制作した上記の共有画像とは別に、提供されたファイルをそのまま保持します。元資料にない作者・ライセンスは推定しません。

SVGは合計約10KBで、背景透過とベクターの輪郭を維持して配信します。HTMLに表示寸法を指定し、Viteでハッシュ付きの独立ファイルとして出力します。装飾画像として扱い、読み上げや操作を妨げないようにしています。
