# 効果音の制作・選定

生成・加工した複数の候補を人が単音と実際の遊びで聴き比べ、JSONで選定・作り直し・追加希望を返します。候補の追加と通常の遊びへの採用は別の作業です。生成や波形の機械検査だけで、音色・聞き疲れ・操作との同期を確認済みにはしません。

## 反復中と採用時の検証

| 変更 | 実施する検証 |
| --- | --- |
| 比較用MP3・候補台帳・制作記録だけを追加・更新 | `npm run sound-review:check -- <slug>`。生成・加工した候補を人が試聴する。ビルド、ゲームの詳細テスト、全体回帰、AWSビルドは省略する |
| 比較ツールのコードを変更 | 変更ファイルの整形、`npm run check`、`npm run test:sound-review`。UI・再生・プレビューを変更したら通常ビルドと対象の比較画面のブラウザー検査・実画面レビューを行う |
| 初めてゲーム内の再生箇所を追加、再生処理・タイミングを変更 | 選定途中でも `npm run check` と `npm run test:toy -- <slug>`、対象の実画面レビューを行う |
| 音を最終採用し、通常の遊びの採用音・音なしを変更 | `npm run check` と `npm run test:toy -- <slug>`、対象の実画面レビュー。単音と重ねた音の聴感を確認し、実機未確認は明記する |

候補だけの反復で長いテストを毎回実行しません。一方、選定途中という理由でゲーム本体の変更に必要な検査を省略しません。既に確認した共通コードを変更していなければ、候補追加のたびにUIテストも反復する必要はありません。対象のブラウザー専用検査は各遊びのREADME・[テスト対応表](../tests/test-plan.mjs) を参照してください。全体回帰が必要な変更は [開発ガイド](development.md#検証範囲の選び方) に従います。

`sound-review:check` は候補の記号・順番・採用ID、MP3の存在とSHA-256、制作記録との対応、未登録ファイルを検査します。WAV・生成環境・ブラウザー・既存のビルド出力は不要です。実際のデコード、音量や音色の聴感、ゲームの動作、公開ビルドへの混入を確認する検査ではありません。

## 保管先

| 内容 | 保管先 | Git |
| --- | --- | --- |
| 生成原本WAV・生成途中のファイル | `tmp/audio-originals/<slug>/` など | 管理外 |
| 加工後の比較用MP3 | `src/<slug>/sound-review/assets/` | 保持 |
| 候補・場面・採用状態・画面設定 | `src/<slug>/sound-review/review.json` | 保持 |
| 固定ID・ファイル・SHA-256・制作記録への対応 | `source-assets/<slug>/audio/review/candidate-identities.json` | 保持 |
| モデル・生成条件・加工条件・利用条件・提出された選定JSON | `source-assets/<slug>/audio/` | 保持 |
| 採用した配信用MP3 | `src/<slug>/assets/` | 保持 |
| 作業中の選定JSON | ブラウザーの下書き、または `tmp/効果音選定/` | 管理外 |

比較画面もゲーム内プレビューも圧縮済みMP3を使います。採用時は選定したMP3をそのままコピーし、再圧縮で別の音にしません。原本のない環境でも選定とWebビルドができます。原本から再加工する場合だけ、制作記録に示す配置へ原本を復元します。`tmp/` はバックアップではなく、長期保存が必要な原本は別途保管します。seedだけで同一波形の再生成は保証しません。

生成・加工記録のファイル参照はプロジェクトルート相対とし、一時的な絶対パス・認証情報・モデル重みを残しません。記録する生成条件と利用条件は [開発ガイド](development.md#効果音の制作と素材管理) を参照してください。

## 初めて選定ツールを付ける

共通実装は [src/shared/sound-review/](../src/shared/sound-review/) にあります。比較画面・選定JSONの検証・コピー／書き出し／読み戻し・追加リクエスト・再生の停止と解放を使い回します。ゲーム固有の再生箇所・重なり方・発音上限は各遊びが所有します。

1. 鳴らす場面を決めます。場面IDはゲーム側の音のIDに合わせ、以後並べ替え・改名しません。
2. 既存の遊びに比較用の設定と小さな接続モジュールを作ります。既存の選定ツールを上書きするコマンドではありません。

   ```sh
   npm run sound-review -- init <slug> --title "遊びの名前" --scene tap --scene-title "触ったとき"
   ```

3. 作成された `sound-review/review.json` の場面の説明、繰り返し間隔、再生ゲイン・フェードをゲームに合わせます。場面を増やすときは `scenes` へ追記し、`current` に同じIDと `null` を追加します。未採用は `null`、明示的な「音なし」の初期選択は `initialChoices` で指定します。設定の定義・検査は [catalogue.ts](../src/shared/sound-review/catalogue.ts) が正本です。
4. HTMLのスクリプトを `app.ts` から `entry.ts` へ変更し、次の分岐を置きます。`import.meta.env.DEV` を各遊びの入口に記述し、候補を公開ビルドの依存から外します。

   ```ts
   void (async () => {
     const query = new URLSearchParams(location.search);
     if (import.meta.env.DEV && query.has('sound-review')) {
       await import('./sound-review/app');
     } else {
       if (import.meta.env.DEV && query.has('sound-preview'))
         await import('./sound-review/preview');
       await import('./app');
     }
   })();
   ```

5. ゲーム側の音声実装に、初期化前に音源URLの対応を差し替える `setSoundPreview` 相当の接続点を設けます。値は場面ごとのURLまたは `null` で、`null` はその音を鳴らしません。通常の採用URLを既定とし、この接続点を読み込むだけでは音声コンテキストや再生を開始しないようにします。`sound-review/preview.ts` は次の形で接続します。

   ```ts
   import { previewUrls } from '../../shared/sound-review/preview';
   import { config } from './registry';
   import { candidates } from './catalogue';
   import { setSoundPreview } from '../sound';

   setSoundPreview(previewUrls(config, candidates, location.search));
   ```

6. 対象の初期導入検査に、比較画面、ゲーム内プレビュー、JSONの持ち運び、公開用manifestに比較モジュール・候補がないことを追加します。実装例は [おうちバラバラの入口](../src/ouchi-barabara/entry.ts)・[音声接続点](../src/ouchi-barabara/sound.ts)・[比較画面のブラウザー検査](../tests/ouchi-sound-review.mjs) を参照してください。比較用のCSS・候補のglobを通常のゲームから直接importしません。

`init` は比較画面の足場を作ります。ゲーム側の再生処理・HTMLの入口・プレビュー接続・テスト登録を自動で書き換えません。初期導入を確認した後は、以下の短いループで候補を追加します。

## 候補を作り直すループ

1. 返されたJSONの候補ID・メモ・追加希望を読み、作り直す場面だけを生成・加工します。通常の遊びの採用音は変えません。特定候補の一部が良い場合は、参照したい成分と避けたい成分を分けて扱い、必要なら既存候補から離れて新規生成します。
2. 原本はGit管理外へ、生成・加工条件とハッシュは素材記録へ保存します。不要部分の除去、フェード、聴感を考えた音量調整、配信用圧縮を行います。加工記録には各音の `output_sha256`、`duration_seconds`、`decoded_peak_dbfs` を残します。複数音は `cues` 配列で記録できます。ピークの登録上限は [追加コマンド](../scripts/sound-review.mjs) を参照し、ピークだけで音量を最大化しません。
3. 圧縮済みの新候補を登録します。入力MP3は `tmp/` など比較用assetsの外に置き、加工記録は `source-assets/<slug>/audio/` 内に置きます。

   ```sh
   npm run sound-review -- add <slug> <scene-id> \
     --file tmp/audio-originals/<slug>/processed/candidate.mp3 \
     --name "短く落ち着く木の音" \
     --record source-assets/<slug>/audio/review/round-2-optimization.json
   npm run sound-review:check -- <slug>
   ```

   コマンドは次の記号を割り当て、MP3のコピー、候補台帳・固定ID記録・制作記録への対応を追加します。既存候補・採用音・選定済みの下書きは変更しません。A・B・Cの次はD・E・F、Zの次はAAです。場面単位の記号なので、JSONでは `<scene-id>-<letter>` を使います。同じ台帳への追加コマンドを並列実行しないでください。

4. `npm run dev` で `/<slug>/?sound-review` を開きます。新候補の直接リンクは `#candidate-<scene-id>-<letter>` です。1回と連続再生を聴き比べ、「選んだ音で遊ぶ」で操作との同期や重なりを確認します。既存の候補の変更が必要になっても、ファイルを差し替えず新しい記号として追加します。
5. 「この音にする」「作り直す」「今回は音なし」「まだ選ばない」とメモを記録します。追加したい場面は「追加したい音」に書きます。「選定結果をコピー」でチャットに貼るか、JSONを書き出して渡します。確認チェックは人が実際に確認したときだけ付けます。選択の変更でチェックは解除されます。

候補を追加しても `catalog`・`storageKey` を変えず、既存のIDと意味を維持します。追加だけなら以前のJSONは同じ音を指し続けます。後から新しい場面を追加して古いJSONを読み込む必要が生じた場合は、その発行済み形式だけを対象に移行方法を決めます。新しい遊びに過去の遊びの互換処理をコピーしません。

## 最終採用

人が明示的に決定したJSONを `source-assets/<slug>/audio/review/selections/` に保持します。確認フラグが未設定でも、明示的な採用決定を未選定に戻しません。未確認を確認済みにも書き換えません。

選ばれたMP3を通常の配信用素材へコピーし、ゲーム側のURL対応と `review.json` の `current` を一致させます。「音なし」はゲーム側でも無音とし、`current` を `null`、初期選択を `none` にします。素材記録に候補ID・配信ファイル・選定JSON・ハッシュの対応を残し、再加工スクリプトが旧音源へ戻さないようにします。場面固有の処理は [おうちバラバラの採用記録](../source-assets/ouchi-barabara/audio/adopted.json) を参考にします。

採用時の検証を終えたら、変更した場面、実施した機械検査と聴感・実機確認の範囲、未確認事項を報告します。過去の候補は比較用に保持できますが、公開ビルドには採用ファイルだけを含めます。
