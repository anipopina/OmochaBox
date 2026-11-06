# くるっとえほん — 完成確認記録

2026-11-06、指定の保存済み OmochaBox Codex Web 環境 `/workspace/OmochaBox` で制作。着手時とmain反映前に確認したGitHub mainは `4f4e4a628591ee424b35c8879d490cb6448bcef7`。着手時の作業ツリーはクリーン。指定文書、初期6案の本文とPNG、既存17作品を確認。初期6案はすべて実装済みで、重複制作していない。

## 実装と素材

紙の角を引いて3つの場面を行き来する絵本遊び。折り線に対して反射したポリゴンで紙の裏を描き、次の絵を段階的に見せる。中央タップでも次へ進み、短いドラッグは元へ戻る。大きな前後ボタン、左右キー、Enter/Space、pointerイベントを伴わないクリックに対応。めくり中のbusy状態で二重実行を防ぐ。

親が本タスク用に生成した「花畑のうさぎ」「海のくじら」「夜空のふくろう」を実見して採用。原本リンク、SHA-256、変換条件は `source-assets/kurutto-ehon/`。組込みWebP3枚は1200×900、合計516,302 bytes。音、点滅、得点、失敗、時間制限、設定UI、ストレージはない。依存追加、AWS公開対象の変更、既存遊びの改善実装もない。

## 最終コードの通し検証

独立レビュー後、最終アプリコードを変更せず `npm run check` と `npm test` を先頭から最後まで実行し、両方の終了コード0を確認した。途中再開の合算ではない。

- checkログ: `2026-11-06-kurutto-ehon-check.log`。SHA-256 `2c0b90cef752314f502b2732ec5009659747d9af3cdc052058be1a497c14dbc4`。
- npm testログ: `2026-11-06-kurutto-ehon-test.log`。SHA-256 `5e925e2ab1cb86bd38e35ba8f0a2d27c22b8c16f36b3880d50ccb50be21b823c`。

全体検査はビルド、AWS公開対象の分離、infra、素材、共通戻るボタン、入口、既存17作品、新作の専用検査を含む。新作は320×568、390×844、820×1180、844×390、568×320、1280×900で前後タップ、短い／長いドラッグ、キャンセル、循環、56px操作領域、画面内配置を検査。中央タップ、CDPマウス、複数指キャンセル後の再操作、キー、クリック、blur/resize/pagehide/hidden中断、減らした動き、入口往復、再入場、画像decode失敗からの再読込み、JS例外なしも通過。

開発途中には既存テストの入口17件の固定期待値を18件へ修正した。また画像復旧後にpointerイベントを伴わないclickを無視する経路を発見し、click-only入力を受け付けるよう修正。修正後の専用検査に加え、上記の通し検査で再確認した。

## クルミの独立操作確認

公開v49、クラウドChrome 1180×757で、入口の18作目と作者リンク、中央タップ、ドラッグで次へ、短い約30pxドラッグで同じ場面へ復帰、前のページ、5回連打、右矢印キーで3場面循環、ホーム往復、再入場、ブラウザBack/Forward後の再表示を実操作確認。

白い紙の裏と折れ影、3場面の違い、大きな主役、角の矢印が明確で、無音の意図に合い、文字なしでも中央タップで始められるとの評価。横はみ出しなし。修正必須の不具合は見つからず、通しテスト成功を条件にmain反映の確認を得た。

独立したモバイル実機、Safari、OSジェスチャー、幼児による確認は未実施。CDPの画面サイズ・タッチ検査と区別する。

## Sitesとmainの対応

- URL: https://omochabox.ryonchibi.chatgpt.site/kurutto-ehon/
- project_id: `appgprj_6ad7020cf85c81919ee1984743405a06`、publicを維持。
- 公開版: 49。
- Sites source: `71c437da92c7c1e3ff372b86fd9be492fd1d9fe7`。
- version_id: `appgprj_6ad7020cf85c81919ee1984743405a06~appgver_020a0d1c4c748191afed59b9f0263609`。
- 成功deployment: `appgdep_6aedc9c8fb8c819185fe12a8598d4112`。
- 保存アーカイブ: `kurutto-ehon-review-r2.tar.gz`、保存ツールのcontent hash `sha256:615a833e90b6c2df17cff7d41e9970d3ad27aa1d47959850f78f5ef6a0b4d46f`。

公式helperでopen、ソース同期、check/build、通常commit/push、package、save、deployを実行。最終コードのビルド全138ファイルは保存アーカイブ内の対応ファイルとバイト一致。追加の1ファイルは公式helperの `dist/.openai/hosting.json`。記録更新だけで同一内容を再保存・再公開しない。

公開URLの直接バイト照合は `https://omochabox.ryonchibi.chatgpt.site/favicon-16x16.png` の取得がHTTP403で停止。Python HTTPError、reason Forbidden、server envoy、Content-Type text/plain; charset=UTF-8、本文 `error code: 1010`。同一経路の確認でも同じ応答。取得コマンドは実行されており、自動承認レビューの拒否ではない。拒否した層は未特定。環境診断の保存記録はなく、別経路へ迂回していない。公開配信の全ファイル直接一致は未確認で、上記アーカイブ対応と親の公開画面確認を代わりの事実として区別する。

## 公式ツール復元と検証資料

欠落していた公式Sites 1.1.3の7ファイルは、既存Drive ZIPからSHA-256 `11bd88756cdd01fef8a88f6f52689e39200edbfeaa54232192934468d2748dbc` を照合して `/workspace/sites-official` へ未改変復元。親も現行公式ファイルと7/7バイト一致を確認。資格情報はメモリ・stdinのみで扱い、ツールや資格情報はリポジトリ・成果物に含めていない。

レビュー段階の証拠ZIP: https://drive.google.com/file/d/1GTTVzpVbM3gJmnAiwQT56YmgiUiVTbg5/view 。既存クルミ/おもちゃボックス直下、非共有、5,675,971 bytes。SHA-256 `8b73774efb61338317f3f3b1f1e933e43faed593cd2cb83e3ca86030b6f4e313`。初回保存は自動承認で保存先・許可不足として拒否（未実行）。履歴読取りと保存先フォルダの所有・非共有メタデータを追加確認後、1回だけ再試行し成功。保存先・共有状態と読戻し全バイト一致を確認済み。このZIPは最終通し検査より前の記録であり、最終結果は本稿と同梱ログを優先する。


## main反映時のメール保護

最初の通常pushはGH007（非公開メールの公開防止）で拒否され、origin/mainが更新されていないことを確認。GitHubの保護設定は変更していない。既存mainが使用しているCodexのnoreply作者・コミッターメタデータを用い、同一の検証済みツリーから最新mainを親とする公開用コミットを作成する。元のローカルレビュー用履歴は保持し、リモート履歴の強制書換えは行わない。
