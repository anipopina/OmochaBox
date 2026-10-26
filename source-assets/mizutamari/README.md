# みずたまり — 制作素材

`concept.png` は親スレッドが本プロジェクト用に画像生成で制作し、Google Driveで共有した企画参照画像です。2026-10-26に公式Driveツールで取得し、原寸1536×1024の実画像を確認しました。

- Drive: https://drive.google.com/file/d/1dfLxJt3K8ETfqeZdykyi2hetMPxbmVDr/view
- SHA-256: `01cbe598f358733fe4e6bc6b51eaccab32782b4ba292b16bd3b8ea4eab1e7456`
- 原本: PNG、2,166,641 bytes。
- 用途: 浅いアクア水面、葉の質感、大きな同心円の見た目の参照。画面ラベル・指・タブレット枠は説明用であり、実装や配信には含めません。
- 水面は静かに保ち、波紋と葉の反応を主役にします。
- 浮き葉は下記の正式素材ZIPから受領・組込み済み。

## 受領した葉素材

2026-10-26に[正式素材ZIP](https://drive.google.com/file/d/1mFzfKqQuL_TrHtW9zp_opTOsbmg3rHin/view)を公式Driveツールで取得。`leaves/` にPNG・WebP・親の組込みメモをそのまま保存しました。PNG/WebPとも256×256、WebP合計32,914 bytes。OpenAI image_gen / 2026-10-26 / original generated leaf art。

配信先 `src/mizutamari/assets/` は受領WebPとバイト一致。春緑の楕円葉、青緑の丸葉の実画素を確認済み。再圧縮・描き直しはしていません。詳細な生成プロンプトと元画像からの縮小記録は [受領メモ](leaves/README.md) を参照。金色葉は不採用で配信しません。
