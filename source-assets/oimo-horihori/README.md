# おいもほりほり 素材

2026-11-07、OpenAI画像生成で本プロジェクト向けに制作した透過PNGのサツマイモ1点。第三者ストック素材は使用していません。排他的権利や第三者ライセンスは推定しません。

原本: `original.png`（1536×1024 RGBA）。Google Driveにも保存済み:
https://drive.google.com/file/d/1nRj9rrWgZG-ySlFgqfyZQISvjcbavn1N/view

用途: 掘ることで現れるサツマイモ、収穫物、入口カード。鮮やかな紫の皮、土の小さな付着、先細りの自然な形、顔や文字なし、透過背景、絵本のガッシュ・粘土風という指定で生成しました。

Pillowで透明余白をbbox (32,48,1508,994)まで除去し、800×600内へ縮小（実寸800×513）、WebP quality=85/method=6。生成原本は変更していません。形状変化は表示時の回転・拡縮です。SHA-256・サイズは `provenance.json`。


## 葉

2026-11-07にOpenAIの画像生成で制作した、真上視点のハート形のサツマイモ葉クラスタ。`leaves-original.png` は提供原本（1312×1199 RGBA）をそのまま保持します。既存芋に合わせた鮮やかな緑、絵筆の色面、立体感、短い赤緑の茎、透過背景、文字・背景なしという指定。提供原本の取得後、提供ハッシュとの一致を確認しました。

配信用 `leaves.webp` は透過余白のみcropし720px内へ縮小、WebP quality=85/method=6。配置の見切れ・回転はCSSで行います。原本・配信のハッシュとLibrary識別子、変換寸法は `leaves-provenance.json`。

## 土

2026-11-11採用。Poly Havenの [Farm Soil](https://polyhaven.com/a/farm_soil)（著作者: Amal Kumar）を利用者が調整した画像を `soil-original.jpg` として保持します。上流の未加工画像ではありません。

上流素材は [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)。[Poly Havenの利用条件](https://polyhaven.com/license)で、改変・商用利用・再配布が認められ、帰属表示は必須でないことを確認しました。公開リポジトリへの同梱・Web配信が可能です。調整済み画像は利用者から本プロジェクトで使う原本として提供されました。

配信用の表面・底面・透過土塊は `prepare-soil.py`（Pillowを使用）で生成します。端の明暗差を抑えたうえで、表面は明るさを上げ、底面は暗く模様を抑えています。土塊は表面の異なる位置を切り出して輪郭と陰影を付けた4種のスプライトです。画面上の配置・大きさは実装側で管理します。寸法・容量・SHA-256は `soil-provenance.json` を参照してください。

## カゴ

2026-11-11、OpenAIの組み込み画像生成で本プロジェクト向けに制作。原本は `basket-original.png`、生成指示全文は `basket-prompt.txt` に保存しています。真上から見た空の丸い編みカゴで、金茶色の天然素材、太い縁、内側の陰影、透過背景を指定しました。取っ手・収穫物・文字・背景は含めません。

第三者のストック素材・参照画像は使用していません。プロジェクトの素材として公開リポジトリへの同梱・Web配信に使用します。第三者ライセンスや排他的権利は推定せず、追加の帰属表示義務は付されていません。

Pillowで透明余白を除去し、Lanczosで長辺512px内に縮小、WebP quality=85/method=6で透過を保持しています。配信用は `src/oimo-horihori/assets/basket.webp`。寸法・容量・SHA-256・切り出し範囲は `basket-provenance.json` を参照してください。原本は加工していません。

## 入口カード

2026-11-11、OpenAIの組み込み画像生成で制作した、土から見つかったおいもと葉の画像を採用しました。カゴを含めず、実際のゲーム画面と配信用の土を参照し、陰影・彩度・土の立体感を抑えた構図です。原本は `card-original.png`、生成指示全文は `card-prompt.txt`、配信用は `src/assets/previews/oimo-horihori.webp`。

参照素材の来歴と利用条件は上記のおいも・葉・土に従います。生成部分について第三者ライセンスや排他的権利は推定しません。本プロジェクトの公開リポジトリへの同梱・Web配信に使用します。

原本を保持し、PillowのLanczosで1200×800に縮小、WebP quality=85/method=6で圧縮しています。採用した候補のWebPは再圧縮せずコピーしました。変換・参照情報とSHA-256は `card-provenance.json` に記録しています。
