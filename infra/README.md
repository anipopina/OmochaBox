# AWS本番公開

通常表示する遊びは [`config/production-games.json`](../config/production-games.json) の値を `true` にします。未記載・`false` の遊びは試作品として扱い、トップページの「しさくひんも みる」をオンにすると表示します。設定はブラウザーに保存し、保存できない場合もそのページ内で切り替えられます。誤ったIDやboolean以外の値はビルドを失敗させます。通常表示の承認・選択はユーザーが行います。

```sh
npm run build:production
npm run preview:production
```

本番ビルドは `dist-production/`。試作品も含む全遊びのページ・実行コード・プレビューを出力するため、試作品のURLにも直接アクセスできます。公開範囲を制限するアクセス制御ではありません。新しい遊びは通常表示には自動追加しません。通常の `npm run build` はSites向けに全遊びを `dist/` に出力し、初回から全遊びを表示します。

## AWSの構成

[`config.json`](config.json) にホスト名・Route 53の公開ゾーン名・S3のリージョン・プロファイルを指定します。

- `omochabox.anipopina.com`、プロファイル `ai-dev`。
- 東京の非公開S3からCloudFront OACで配信し、HTTPはHTTPSへ転送。S3・CloudFrontのアクセスログは作成しません。
- CloudFront用のACM証明書は米国東部（us-east-1）でDNS検証。既存の `anipopina.com` 公開ゾーンを検索し、証明書検証レコードと本番ホストのA／AAAAレコードを作ります。
- `/遊び/` を `/遊び/index.html` に解決し、非公開・存在しないパスは404にします。
- 再公開ではS3の不要ファイルを削除し、CloudFrontの全パスを無効化します。`false` に変えた遊びも次回デプロイで配信対象から外れます。
- スタック削除保護を有効にし、S3はスタック削除時も保持します。

## 初回準備とデプロイ

AWSリソースの作成・DNSの変更を伴います。実行はユーザーの明示的な依頼がある場合だけ行います。

初回は `ai-dev` の認証と、東京・米国東部の両方のCDK bootstrapが必要です。以下の `ACCOUNT_ID` は同プロファイルのAWSアカウントIDに置き換えます。

```sh
npx cdk bootstrap aws://ACCOUNT_ID/ap-northeast-1 aws://ACCOUNT_ID/us-east-1 --profile ai-dev
npm run infra:synth
npm run infra:diff
npm run deploy:production
```

`infra:synth`・`infra:diff`・`deploy:production` は本番ビルドを作り直し、設定したプロファイルを使います。2つのスタックは証明書、本番配信の順にデプロイされます。実際のAWSアカウント・既存DNS・権限の確認は、認証後のsynth／diffで行います。構成を変更する場合はdiffを確認してください。

ローカル確認は `npm run check`、両環境のビルド後に `npm run test:publication` と `npm run test:infra`。後者はテスト用IDを使うオフラインsynthで、AWSリソースは作成しません。
