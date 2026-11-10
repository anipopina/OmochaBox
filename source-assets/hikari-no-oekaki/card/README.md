# 入口カードの画像

2026-11-10制作。ゲーム画面を参照して画像生成で制作した、花3輪と光の線の画像です。実際の花の形と背景を維持し、カードの端が見切れても伝わるよう四隅の葉を除いています。

`reference-game.png` はゲームのCanvasから取得した参照画像、`reference-generated.png` は中間の生成原本、`reference-generated.webp` は採用画像の生成に渡した縮小画像、`card-original.png` は採用画像の原本です。プロンプト・来歴・変換条件・ファイルのハッシュは [provenance.json](provenance.json) に記録しています。元の葉素材の来歴は [library-provenance.json](../library-provenance.json) を参照してください。

配信画像は `src/assets/previews/hikari-no-oekaki.webp`。原本をRGBに変換し、LANCZOSで縮小してWebPに圧縮しています。透明背景は不要です。カードの縦横比に応じて中央を基準に切り抜きます。

利用条件は [OpenAI Terms of Use](https://openai.com/policies/terms-of-use/) のContent節を2026-11-10に確認しました。出力の権利帰属に基づき、改変・公開リポジトリへの原本同梱・Web配信に使用します。確認した規約には出力固有の帰属表示義務はありません。画像生成で制作した来歴を保持し、人が描いた画像として表示しません。新たな第三者素材のライセンスは追加していません。
