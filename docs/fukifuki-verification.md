# ふきふき、まど — 2026-10-20

保存済み OmochaBox クラウド環境 `/workspace/OmochaBox` で制作。開始時 GitHub main は `b659c6d6a5e36d0335328719d3358a51482c0495`、作業ツリーに未完了変更なし。既存 Sites は一般公開・version 3。既存 project ID と URL を再利用。

## 完成内容

- 指で拭く窓、生成した庭と動物、雲ボタンによる再曇り。無音・点数や達成率なし。
- 太い拭き跡、星の反応、56px以上の操作、複数指、キャンセル、再入場、サイズ変更、キーボード、reduced-motion。
- 入口の2枚目カードと anipopina.com リンク。追加npm依存なし。
- 原本PNG 2,945,907 bytesからWebP 361,864 bytesへ最適化。素材原本・出典・変換記録同梱。
- README / AGENTS にGoogleアイコンのローカルSVG同梱とライセンス保持方針を追記。今回はGoogle素材を使っていない。

## 検証

`npm run build`、`npm test`。全体結果は `docs/fukifuki-test-results.txt`。

窓は320×568、390×844、820×1180、1180×820、844×390。CDPのタッチ入力、25回の拭き／再曇り、複数指、cancel、サイズ変更時のマスク維持、5回の往復／再入場、100回の再曇り、キーボード、reduced-motion、画像デコードと操作寸法を確認。既存おえかきと入口の回帰テストも実施。

単発の拭きで半透明が残る不具合を検出して、消去ブラシの不透明度を明示する修正を実施。テストブラウザの入力状態が画面設定とページ遷移をまたいで残るため、窓の各端末テストは独立タブに変更。配信コードにテストフックは含めない。

入口320px、窓320px・820px・844pxと生成画像を目視確認。代表スクリーンショットを `docs/fukifuki-mobile.png` と `docs/fukifuki-tablet.png` に保存。

実機iPad/iPhone Safari、実際の同時多指・OSジェスチャー、音の聴感は未確認。証明書警告を回避していない。

## 公開手順

通常のGitHub pushのみ。作者は既存コミットと同じ `Codex <codex@users.noreply.github.com>`。保護設定・DNS・課金設定は変更しない。Sites補助スクリプトは環境に存在せず、読み出しも利用不可のため、同一保存済み環境内の `/workspace/omochabox-sites` に既存Sitesソースをcloneし、同じ追跡ファイル内容を通常push。認証は短期トークンを標準入力・プロセス環境だけに渡し、ファイルに保存しない。静的ビルドとhosting manifestのtarをネイティブSites保存・デプロイAPIに渡す。両Git履歴のSHAは揃えない。
