# みずたまり — 制作素材

`concept.png` は本プロジェクト用に画像生成で制作し、Google Driveで共有した企画参照画像です。2026-10-26に公式Driveツールで取得し、原寸1536×1024の実画像を確認しました。

- Drive: https://drive.google.com/file/d/1dfLxJt3K8ETfqeZdykyi2hetMPxbmVDr/view
- SHA-256: `01cbe598f358733fe4e6bc6b51eaccab32782b4ba292b16bd3b8ea4eab1e7456`
- 原本: PNG、2,166,641 bytes。
- 用途: 浅いアクア水面、葉の質感、大きな同心円の見た目の参照。画面ラベル・指・タブレット枠は説明用であり、実装や配信には含めません。
- 水面は静かに保ち、波紋と葉の反応を主役にします。
- 浮き葉は下記の正式素材ZIPから受領・組込み済み。

## 受領した葉素材

2026-10-26に[正式素材ZIP](https://drive.google.com/file/d/1mFzfKqQuL_TrHtW9zp_opTOsbmg3rHin/view)を公式Driveツールで取得。`leaves/` にPNG・WebP・受領した組込みメモをそのまま保存しました。PNG/WebPとも256×256、WebP合計32,914 bytes。OpenAI image_gen / 2026-10-26 / original generated leaf art。

配信先 `src/mizutamari/assets/` は受領WebPとバイト一致。春緑の楕円葉と青緑の丸葉を採用しました。詳細な生成プロンプトと元画像からの縮小記録は [受領メモ](leaves/README.md) を参照。

## ヤナギとツタ

2026-11-26にOpenAIの組み込み画像生成で、文章のみを入力して制作しました。利用条件は [OpenAIの利用規約](https://openai.com/policies/row-terms-of-use/) の出力に関する条項を参照。PNG原本を保存し、縮小した透過WebPを配信します。

- ヤナギの[原本](leaves/leaf-willow.png)は1536×1024の透過PNG。SHA-256は `862a4e98b8c0be94014a47d2cbc97215fc05eb98dfbdea6adc9a5dce35f1d559`。[配信用WebP](../../src/mizutamari/assets/leaf-willow.webp)は5,638 bytes。
- ツタの[原本](leaves/leaf-ivy.png)は1312×1199の透過PNG。SHA-256は `8b1a3cd890b4b69b7d6fd8ba481812e7ef2aaa09776c20218c860e2adad5a3e1`。[配信用WebP](../../src/mizutamari/assets/leaf-ivy.webp)は9,760 bytes。
- 配信用画像は、原本を組み込み画像生成で編集し、既存の緑の楕円葉と青緑の丸葉を色の参照にして中間調を明るくしました。
- 輪郭周囲のかすかなにじみをアルファ値の補正で抑え、不要な余白を除きました。PillowのLanczosで長辺を227pxまで縮小し、256×256の透過面の中央に置いて品質82のWebPに変換しました。

### ヤナギの生成プロンプト

```text
A single isolated fresh green willow leaf sprite for a photorealistic top-down shallow pond browser toy. Perfectly overhead, flat single long narrow lance-shaped willow leaf with a gentle natural curve, two tapered tips, visible light midrib and subtle veins, short stem, fresh spring leaf green with a muted olive undertone and pale green highlights. Match the texture of a real leaf in soft overcast daylight, a moderately bold silhouette at small size; avoid a ribbon-thin or highly curled blade. Diagonal from lower left toward upper right, centered with transparent breathing room on all sides. Entire leaf including stem visible. Plain completely transparent alpha background with nothing else. No water, shadow, droplets, autumn colors, orange, brown, yellow spots, flowers, text, props, or checkerboard.
```

### ツタの生成プロンプト

```text
A single isolated fresh green common ivy leaf sprite for a photorealistic top-down shallow pond browser toy. Perfectly overhead, flat whole single ivy leaf with a broad bold three-lobed silhouette, gently pointed lobes, a slim short stem downwards and clear subtle veins. Fresh medium leaf-green with a soft cool jade undertone and gentle lighter green veins; natural texture and muted photographic highlights, soft cloudy daylight. A solid green healthy leaf without variegation, suited to floating beside a lime-green oval leaf and a teal-green round leaf. Leaf centered with complete silhouette and transparent margin on all sides. Absolutely transparent alpha background. No water, drops, ground, shadow, flower, branches, autumn pigments, yellow trim, text, or checkerboard.
```

### 明るさ調整のプロンプト

ヤナギ

```text
Make a subtle color-only edit to image 1, the isolated narrow willow leaf. Increase the leaf midtone brightness by about 18–23%, with a fresh light spring green between the two established palette examples (image 2 is the lime oval leaf, image 3 is the cool round leaf). Preserve the original willow's slim diagonal silhouette, leaf tip and stem, tiny serrations, vein positions, photographic texture, framing and orientation. Keep color green and moderate; do not make it yellow, white, neon, or glossy. Editable leaf only; images 2 and 3 are palette references only and must not appear in the output. Return a single cutout sprite with true clean alpha, no halo, no shadow, and no background.
```

ツタ

```text
Make a subtle color-only edit to image 1, the isolated three-lobed ivy leaf. Lift the darker leaf midtones by about 20–25%, aiming for a fresh medium-bright leafy green that sits between the palette examples (image 2 is the lime oval leaf, image 3 is the cool round leaf). Preserve the original three-lobed silhouette, stem, leaf veins and fine photographic texture, position and top-down orientation. Keep gentle natural shading and visible darker patches; no yellow or neon effect. Editable leaf only; images 2 and 3 are palette references only and must not appear in the output. Return a single cutout sprite with true clean alpha, no halo, no shadow, and no background.
```

## 砂利の背景

2026-11-26にOpenAIの組み込み画像生成で、文章のみを入力して制作したプロジェクト用の画像です。[OpenAIの利用規約の出力に関する条項](https://openai.com/policies/row-terms-of-use/)を参照し、原本をリポジトリに同梱し、縮小・トリミングしたWebPを配信します。外部画像は生成の入力と配信素材に含めていません。

- [生成原本](gravel-original.png) は1448×1086のPNG。SHA-256は `7ad711458c6fad6b26dcc5c80007b698edb8e0c9a3eb45d8a9f0716a41e2eb00`。
- [標準の配信用画像](../../src/mizutamari/assets/gravel.webp) は全体を1152×864に縮小。337,176 bytes。
- [縦長の配信用画像](../../src/mizutamari/assets/gravel-portrait.webp) は原本中央の724×1086を切り出し、640×960に縮小。195,726 bytes。
- 配信用画像はPillowのLanczosで縮小し、品質79のWebPに変換。水の色はCSSで重ねます。

### 生成プロンプト

```text
Generate an original edge-to-edge photographic texture of very fine crushed pea gravel, intended as the submerged bed of a shallow interactive puddle. Capture a broad patch of ground from directly overhead, looking straight down through an orthographic field, wide 4:3. The camera should feel about two to three meters above a broad patch of tiny crushed stones, not like a close-up. Hundreds to thousands of tiny pieces, each only about 1.5% of the image width and about 1% of the diagonal on average; no standout big rocks. Natural small angular stone fragments and rounded chips, tightly packed, mottled warm gray with hints of slate and sand, gentle low-contrast overcast light, fine detail without crunchy highlights. Fill every edge and corner uniformly; detailed enough that the center third is usable as a vertical crop. Show only gravel. No water, ripples, greenery, debris, text, boundaries, vignetting, borders, or watermark. Generate from text alone.
```

## 入口カード

[入口カードの原本PNG](card-original.png) は、遊びの砂利・葉と波紋の描画を使ってChromiumで撮影し、カードに合わせて葉を大きく置き、中心をずらした大小の波紋を間隔を空けて配置し、外側の波紋の明暗を補ったものです。砂利と葉の来歴・利用条件はこの資料に記録しています。[配信用WebP](../../src/assets/previews/mizutamari.webp) は1200×600、113,956 bytesです。
