# おうちバラバラの素材

## 入口カードの画像

`card-original.png`（1840×1150）は、本プロジェクトのゲーム画面を撮影したスクリーンショットです。外部の素材や画像生成は使っていません。

- 撮影：2026-11-10。ヘッドレス Chromium（SwiftShader）で、横1280×縦800・表示倍率2倍、`?quality=max` で描画しました。戻るボタンと「次のおうち」ボタンは非表示にしています。
- 場面：小さなおうち（青い屋根・ピンクの壁の配色）の1撃目、打撃の約0.4秒後。最初の建物をこの組み合わせにするために、撮影時だけ一時的なビルドを使いました（リポジトリには含めていません）。
- 切り抜き：画面の (180, 120) から 920×575（CSS ピクセル）。

配信用の `src/assets/previews/ouchi-barabara.webp`（960×600、30,798 bytes）は、Pillow 13.0.0 で RGB に変換し、LANCZOS で縮小して WebP quality=84 / method=6 で保存しました（他の遊びのカード画像と同じ条件）。Pillow の環境は [ふきふき、まど の手順](../fukifuki-mado/README.md) で用意できます。リポジトリ直下で次を実行すると再変換できます。

```sh
/tmp/omochabox-images/bin/python - <<'EOF'
from PIL import Image, ImageOps
with Image.open('source-assets/ouchi-barabara/card-original.png') as original:
    image = ImageOps.exif_transpose(original).convert('RGB')
    image = image.resize((960, 600), Image.Resampling.LANCZOS)
    image.save('src/assets/previews/ouchi-barabara.webp', 'WEBP', quality=84, method=6)
EOF
```

| ファイル | SHA-256 |
| --- | --- |
| card-original.png | f041e1605b8dbd18ad8f6d889662e9494b5817d9ba6f17f6d5504ac41c1a8e1a |
| src/assets/previews/ouchi-barabara.webp | ad924ee016f56806b7089960cd27fba9952e43987c382188f4b11f585687d634 |
