# ふきふき、まどの画像

原本はここに保存し、配信用WebPだけを `src/fukifuki-mado/assets/` に置きます。画像一覧と表示順、代替テキストは `src/fukifuki-mado/scenes.json` が管理します。最初の画像はランダム、その後は一覧順で循環します。

| ID | 内容 | 原本 |
| --- | --- | --- |
| garden | 庭のどうぶつ | garden-original.png |
| animal-train | どうぶつ列車 | animal-train-original.jpg |
| frog-pond | 池のカエル | frog-pond-original.jpg |
| shapes-picnic | 図形のピクニック | shapes-picnic-original.png |
| underwater | 海のなかまたち | underwater-original.jpg |
| shapes-hello | 窓からこんにちは | shapes-hello-original.png |

`garden` は2026-10-20にこのプロジェクト向けにOpenAI image generationで制作した画像です。明るい庭、ねこ・うさぎ・いぬ・小鳥、鮮やかな絵本調、文字・ロゴなしという指示から生成しました。外部ストック画像やGoogleアイコンは使用していません。追加5枚は2026-10-21にユーザーから提供された素材です。生成ツールや第三者ライセンスの詳細は未提供のため、推定して記載しません。生成画像について排他的著作権を主張しません。

## 追加・差し替え手順

1. 内容がわかる英小文字とハイフンの固有IDを決めます（例: `rainbow-park`）。連番や日付はIDに使わず、既存IDは変更しません。
2. 原本を `<id>-original.png` または `<id>-original.jpg` でここへ配置します。同じIDの原本は1枚だけにします。鮮やかで形の見分けやすい正方形の絵を推奨します。窓では `object-fit: cover` になるため、端に重要なものを置かないでください。
3. `src/fukifuki-mado/scenes.json` に `id` と絵の内容を伝える日本語の `alt` を追加します。この配列の順が「つぎのまど」の順になります。追加時にapp.tsを編集する必要はありません。
4. Pillow 13.0.0を使って、リポジトリ直下で以下を実行します。原本は上書きしません。

   ```sh
   python3 -m venv /tmp/omochabox-images
   /tmp/omochabox-images/bin/pip install Pillow==13.0.0
   /tmp/omochabox-images/bin/python scripts/optimize-window-assets.py
   ```

5. 出典・提供日・利用条件をこのREADMEへ追記し、`provenance.json` の各画像のハッシュ・変換記録も一緒に保存します。
6. 配信用画像を目視し、表情・輪郭・鮮やかな色が保たれていることを確認して `npm test` を実行します。最初のランダム選択、全画像の循環、曇りのリセット、画面回転で画像が変わらないことを確認します。

## 最適化ルール

EXIFの向きを補正し、背景全体を覆う不透明RGB画像としてWebP quality=86 / method=6へ変換します。最大1360×1360（最大680 CSS px × DPR 2）に収め、拡大はしません。配信ファイル名は `<id>.webp`。不要なEXIFなどのメタデータは渡しません。透過素材は背景用として事前に適切な背景と合成してください。

現在は全画像1254×1254で、解像度を維持しています。各画像は400KB以下を目安にし、大きい場合は画質を確認しながら解像度・品質を見直してください。原本と出力サイズ・SHA-256は `provenance.json` に記録します。削除した画像のWebPと原本は、一覧から外すだけでなく不要か確認したうえで整理してください。
