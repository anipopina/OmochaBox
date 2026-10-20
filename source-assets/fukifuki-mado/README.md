# 庭の生成画像

2026-10-20、OmochaBox の「ふきふき、まど」用に OpenAI image generation で制作。明るい庭、ねこ・うさぎ・いぬ・小鳥、鮮やかな絵本調、文字・ロゴなしという指示から生成しました。外部ストック画像やGoogleアイコンは使用していません。

`garden-original.png` は受け取った原本（1254×1254）。`provenance.json` に原本SHA-256と容量を記録。配信用は Pillow で RGB / WebP quality=86, method=6 に圧縮し、2,945,907 bytes → 361,864 bytes（約87.7%削減）。最大表示680 CSS px、DPR上限2。原本の解像度を維持しました。原本とWebPは目視で動物の表情と色を確認。

第三者の素材ライセンスを推定して付与しません。生成画像について排他的著作権を主張する記載は行いません。

再変換:

```python
from PIL import Image
Image.open('source-assets/fukifuki-mado/garden-original.png').convert('RGB').save(
    'src/fukifuki-mado/assets/garden.webp', 'WEBP', quality=86, method=6)
```
