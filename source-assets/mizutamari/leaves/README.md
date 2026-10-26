# みずたまり — 組込み用葉素材 (2026-10-26)

## 採用素材
- leaf-green.webp / leaf-green.png: 256 × 256 RGBA, 春緑の楕円葉。推奨表示 84–112 CSS px（透明余白込み）。
- leaf-teal.webp / leaf-teal.png: 256 × 256 RGBA, 青緑の丸葉。推奨表示 68–92 CSS px（透明余白込み）。
- WebP 2 枚合計 32,914 bytes。PNG は可逆代替、実行時は WebP のみ読込推奨。
- 中央 anchor 0.5/0.5、画像の縦横比維持、回転・軽い揺れで利用。同時 3–5 枚程度。画面中心の大きな空きを確保。
- 元画像は各 1254 × 1254 RGBA。alpha 0–255 を確認、透明背景・葉の輪郭を目視確認。256px へ縮小し PNG/WebP 化しただけで描き直しや色変更なし。
- 金色葉は生成時の発光ハローが意図に合わず不採用。パッケージには含めない。

## 由来・権利管理
OpenAI 組込み image_gen で本企画向けに新規生成したオリジナル素材。外部画像・外部キャラクター・外部フォント・既存第三者アセットを入力していない。第三者ライセンスの引用・表示義務が発生する素材は使用していない。AI 生成物であり独占的著作権や非侵害を保証するものではない。GitHub 素材記録に「OpenAI image_gen / 2026-10-26 / original generated leaf art」と記載推奨。

## 生成プロンプト（要旨を含む実指示）
Green: Use case: stylized-concept. Asset type: transparent PNG game sprite, original nature illustration. ONE isolated floating spring-green leaf seen perfectly from above, broad gently asymmetric oval with softly pointed tip and short slender stem. Soft handcrafted watercolor and gouache, lime/sage green with subtle yellow veins and organic painted variation. Friendly preschool picture-book feel. Complete leaf centered, genuine transparent background, clean alpha. No water, ripple, shadow outside leaf, glow, ground, border, text, characters or face. Broad readable color masses for a roughly 90px leaf on pale aqua pond.
Teal: ONE isolated roundish small teal-green floating leaf seen perfectly from above, softly heart-shaped like woodland violet, gently scalloped edge, tiny curved stem. Soft watercolor/gouache, sage and blue green, subtle warm central vein and organic painted variation. Friendly preschool picture-book. Centered, true transparency, no water/ripple/shadow/glow/ground/text/face. Broad readable silhouette at 65px.

## 見た目と挙動の提案（実装未確認）
淡いアクアの静かな水面。触れた位置から白〜水色の大きな輪が広がり、近い葉が小さく揺れ、ゆっくり漂う。指の軌跡に間隔を空けて波紋。スコア・タイマー・文字説明不要。中央は空け、葉が波紋を隠さない。リセットせず繰り返し遊べる。戻るボタンのみ、個別設定なし。入力停止後は動きを穏やかに収束。実装画面は企画画像のタブレット枠・指・文字ラベルを含めない。

企画画像: https://drive.google.com/file/d/1dfLxJt3K8ETfqeZdykyi2hetMPxbmVDr/view?usp=drivesdk （企画イメージ・未実装の表記あり）
