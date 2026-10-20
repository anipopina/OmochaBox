# ひかりのおえかき

指先から光の花や道が生まれるCanvasの遊びです。ページURLは `/hikari-no-oekaki/`。

## 遊び方

| 操作             | 結果                            |
| ---------------- | ------------------------------- |
| 触れて離す       | 花が咲く                        |
| なぞる           | 光の道ができる                  |
| 長押しする       | 最大6秒まで花が育ち、離すと咲く |
| 「音あり／消音」 | 音の切り替え                    |
| 「もどる」       | 音を止めて入口へ戻る            |

## 仕様と実装上の注意

- 最大10指に対応します。キャンセルされた操作では花を咲かせません。
- 音は実際に操作するまで再生しません。音の設定はページ内のみで、再入場時は「音あり」に戻ります。
- 画面サイズ変更や非表示・画面離脱時には入力と演出をリセットします。非表示・画面離脱時には音も停止します。
- 描画オブジェクトと同時発音に上限を設け、演出終了後はアニメーションを止めます。
- 動きを減らす設定では花の成長アニメーションや粒子の移動を抑えます。
- 実装は [app.ts](app.ts)、見た目は [style.css](style.css)。背景の葉は静的なCanvasへ描き、操作対象を覆う要素にしません。

## 素材

ユーザー提供素材を使用しています。原本・出典は [source-assets/hikari-no-oekaki](../../source-assets/hikari-no-oekaki/) に集約しています。

- [元の説明](../../source-assets/hikari-no-oekaki/ORIGINAL-README.md)、[画像の出典](../../source-assets/hikari-no-oekaki/library-provenance.json)、[音声の出典](../../source-assets/hikari-no-oekaki/audio-provenance.json)
- 葉は660×660の透過WebP、音声はMP3。配信用ファイルは [assets/](assets/)、容量の比較は [最適化記録](../../source-assets/hikari-no-oekaki/optimization.json) を参照してください。
- 葉の再生成は、リポジトリ直下で `python3 scripts/optimize-assets.py` を実行します。Pillowが必要です。原本を保持し、比較画像は `test-results/asset-comparison/` へ出力します。

## 変更時の確認

リポジトリ直下で `npm test` を実行します。タップ・長押し・複数指・キャンセル、描画の重なり、音の切り替えと読込失敗、非表示・画面離脱時の後始末、画面サイズ変更、入口への往復を確認します。内部状態を使う検証の仕組みは [開発ガイド](../../docs/development.md#テスト用ビルド) を参照してください。

実機iPhone/iPadでは、複数指・OSジェスチャー・バックグラウンド復帰・音色と音量も確認します。
