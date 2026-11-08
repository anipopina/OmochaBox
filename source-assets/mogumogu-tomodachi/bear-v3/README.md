# もぐもぐともだち｜クマ素材 v3

2026-11-09。ユーザーの「茶色い恐竜ではなく、もっとクマらしく」という依頼に基づく画像生成素材。旧版の色調と柔らかい絵本調の質感を参考に、大きな丸耳と内耳、頭と胴の区別、丸い手足と肉球、淡色の口周りでクマとして読める輪郭に変更した。

## ファイル
- source/bear-body.png: 生成原本、1254×1254 RGBA。
- web/bear-body.webp: 配信用768×768 RGBA、62,698 bytes。PNG原本から縮小・エンコードのみ。透明背景を保持。
- preview.png: 500px / 160px の見本。顔は意図的に描かれていない。
- validation.json: 再読込とアルファ検査。

## 組込み
画像には目・鼻・口・眉を描かず、表情アニメーションは既存SVGで重ねる。
このクマは明確な頭部とマズルがあるため、500×500の既存キャラ座標系ではクマのみ目中心を (200,165), (300,165) に置くと口周りの上に収まる。口中心 (250,280) は維持可能。鼻はマズル上部の (250,222) 付近に小さな暗褐色の丸みある三角形/楕円を追加すると、さらに熊らしく読める。鼻は口の最大変形に干渉しない大きさとし、実装担当が表情全種類で確認すること。
これは配置提案であり、実画面の顔・口アニメ確認は組込み側で実施する。画像本体の下部は机で隠れても、大きな丸耳と淡い口周りが残り熊と読める設計。足の肉球のために机位置を変更する必要はない。

## 検査
768px WebPを再読込しRGBA・alpha 0〜255を確認。500px/160pxの画像を視覚確認し、丸耳と内耳、マズル、短い腕が保たれ、旧版よりクマらしく見える。実機・ブラウザ組込み確認は本素材制作では未実施。

## 出典
OpenAI組込み画像生成ツールにより当タスク向けに制作。第三者のキャラクター/ロゴ/フォント/外部素材は使用していない。既存の生成画像 bear-body.png を画風参照とした。外部ライセンスに基づく表示は追加していない。

## 生成指示の要旨
Edit brown body style reference into unmistakable teddy bear. Large round ears with cream inner ears, broad round head, short arms, plump small body and rounded paws. Warm soft gouache texture, blank cream muzzle patch. No eyes, nose, mouth or brows because runtime overlays animate them. Transparent background; no setting, text or outside shadow. Front view square sprite.
