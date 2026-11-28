# Zen Maru Gothic

入口と各遊びのWebフォントです。大平善道（Yoshimichi Ohira）氏の書体のうち、MediumとBoldを必要な字形に絞ってWOFF2で配信します。

- 原本は [Google Fonts の固定リビジョン](https://github.com/google/fonts/tree/92503f07b74eab956c1abf4956fbf46170716caa/ofl/zenmarugothic) の `ZenMaruGothic-Medium.ttf` と `ZenMaruGothic-Bold.ttf` です。
- [SIL Open Font License 1.1 と著作権表示](../../src/public/licenses/zen-maru-gothic/OFL.txt) を公開ビルドに含めます。原本のライセンスには予約フォント名の指定がありません。配信するサブセットもOFL 1.1で、フォントの著作権とライセンスの名前レコードを保持します。
- [収録文字一覧](unicodes.txt) が生成元です。矢印などの操作記号や絵文字のうち、書体にない字形は端末のフォントで表示します。

## 新しい漢字を加える

[収録文字一覧](unicodes.txt) に対象のコードポイントを追加します。たとえば「光」は `U+5149` です。既存のコードポイントは引き続き使う文言のために残します。リポジトリルートで以下を実行して両方のWOFF2を作り直します。Webページから外部サイトへのフォント取得は発生しません。

```sh
(
set -eu
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
python3 -m venv "$work/venv"
"$work/venv/bin/python" -m pip install 'fonttools[woff]==4.61.1' 'Brotli==1.2.0'

upstream=https://raw.githubusercontent.com/google/fonts/92503f07b74eab956c1abf4956fbf46170716caa/ofl/zenmarugothic
for pair in 500:Medium 700:Bold; do
  weight=${pair%%:*}
  original="ZenMaruGothic-${pair#*:}.ttf"
  curl -fL "$upstream/$original" -o "$work/$original"
  "$work/venv/bin/pyftsubset" "$work/$original" \
    --flavor=woff2 '--name-IDs=*' --no-ignore-missing-unicodes \
    --unicodes-file=source-assets/zen-maru-gothic/unicodes.txt \
    --output-file="$work/zen-maru-gothic-$weight.woff2"
done
cp "$work"/*.woff2 src/assets/fonts/zen-maru-gothic/
)
```

一覧とWOFF2を一緒に更新し、ビルドした画面で追加した字が表示されることを確認します。未収録の漢字を表示するときは、端末の書体に切り替わります。
