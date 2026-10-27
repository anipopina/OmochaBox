# もぐもぐともだち — 絵本調スプライト v1
制作日: 2026-10-27 / 制作: クルミ（組込み前の独立素材）

## 納品
- web/friend-body.webp: 768×768、顔なしミント色の丸いおともだち。55,354 bytes。
- web/strawberry.webp: 256×256、いちご。12,590 bytes。
- web/banana.webp: 256×256、バナナ。6,986 bytes。
- web/carrot.webp: 256×256、にんじん。9,104 bytes。
- source/: 各生成PNG原本（1254×1254）。
- body-preview-512.png: クリーム背景に512px表示した確認用。
- food-preview-96.png: 各96px表示した確認用。
Web素材合計84,034 bytes。すべて透過RGBA。余白を残した正方形、クロップなし。sourceから同じ縦横比で縮小しWebP quality90。WebPも読み戻して確認済み。

## 組込み仕様・座標
座標は画像全体の左上(0,0)、右下(1,1)の正規化座標。
- 本体推奨アンカー: 中央下(0.5,0.91)。変形中心は(0.5,0.67)。
- 表情を重ねる初期位置の目安: 左目(0.40,0.40)、右目(0.60,0.40)、口中心(0.50,0.56)、頬(0.30,0.53)/(0.70,0.53)。実画面でかわいさに合わせて微調整する。
- 目、口、鼻、ピンクの頬、表情線は画像に含めていない。顔のアニメーションは独立したコード層にする。
- 耳、腕、足は本体画像に含む。独立した手のアニメーションには追加素材が必要。本体全体を大きく拡縮するだけで「もぐもぐ」を代用しない。
- 食べ物の飛行アンカー: 各画像中心(0.5,0.5)。CSS object-fit:contain推奨、葉や先端をclipしない。
- 食べ物は表示64〜112px、本体は表示280〜512pxを想定。タップ領域は画像の細い形に合わせず十分大きく。

## 表現と権利
ユーザー保存の「さいしょの６案.png」の右下を画風・題材の参照として、組込み用途の個別画像を今回新規生成。第三者の素材集・フォント・商標・キャラクターは取り込んでいない。生成にbuilt-in image_genを使用。外部素材のライセンス表示は追加していない。AI生成物について独占的著作権や権利保証を意味しない。
参照: https://drive.google.com/file/d/1ajVv2YI_84W0nKctK_jYaOwtZbDe9LHc/view
仕様: https://drive.google.com/file/d/1wbo-tsw3UAUMhd5js01xDBQXoStcx89o/view

## 検査
4枚それぞれ元画像を目視。透過WebPへ書き出し・再読込。クリーム背景上で本体512pxと食べ物96pxを目視し、白い四角や目立つ外周ゴミなし。丸い形、色、食べ物種別が読み取れる。顔は未合成なので最終のかわいさ、口と食べ物の重なり、アニメーションは実装レビューで確認する。実機・ゲーム内動作はこの素材作業では未確認。

## 生成指示の要旨
Body: reference bottom-right mint creature; one faceless front-view plump mint-green round blob; small ear nubs, oval side arms, tiny feet; gouache subtle paper grain; blank face; no eyes/mouth/nose/pink cheeks/food/ground/shadow/text; transparent.
Foods: single centered food per transparent square; matching warm storybook gouache and crisp small silhouette; strawberry red with golden seeds and green crown; whole yellow smile-curved banana with blunt brown tips; plump orange carrot diagonal with three broad green leaves; no face/plate/ground/shadow/text.
