# AWS本番公開

公開する遊びは [`config/production-games.json`](../config/production-games.json) の値を `true` にします。未記載・`false` の遊びは対象外です。誤ったIDやboolean以外の値はビルドを失敗させます。初期対象は「ふきふき、まど」「ぽんぽんスタンプ」です。承認・選択はユーザーが行います。

```sh
npm run build:production
npm run preview:production
```

本番ビルドは `dist-production/`。対象外のゲームページ・実行コード・専用プレビューを含めません。共通の装飾素材は共有します。通常の `npm run build` はSites向けの全遊びを `dist/` に出力し、本番リストの影響を受けません。

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
