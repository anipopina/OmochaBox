# ぷかぷか、ふうせんの素材

- `concept.png`: 親から提供された画像生成による画面案。2026-10-21に接続済みDriveから認証付きraw downloadを取得し、この保存済みOmochaBoxクラウド環境に保存、実画像を確認。
- Drive: https://drive.google.com/file/d/1Wr7tfQ_vJcmG41f6ay5ddWNHDwKON-8g/view
- PNG、1536×1024、1,737,796 bytes。
- SHA-256: `3e4667bb7436de70db99631e6a1f723f6f4858b338c8e29e8ad2d9268aacacc7`。
- 参考用途のみ。画面案のPNGは配信しません。

配信用は `src/pukapuka-fusen/assets/` の透過SVGです。cyan/purple/triangle/starは `src/assets/characters/shapes/` のユーザー提供02/03/04/05から顔と形のパスを再利用しています。青丸の手足を取り除いて楕円の体にし、各画像に風船の結び目とひもを追加しました。既存6SVGは変更していません。原資料にない第三者ライセンスは推定しません。

`pump.svg` は画面案を参考にした本プロジェクト用ベクター作画です。配信用5SVGは合計6,955 bytes、背景透過・解像度非依存。青丸は余白をviewBoxで詰めて、他の形と大きさを合わせています。案内の手はHTML内の小さなSVG。画面内の動作・文字・空・雲はDOM/CSS/TypeScriptで実装し、画面案を背景画像として貼り付けていません。画像の外部取得やフォントCDNはありません。
