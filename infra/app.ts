import { App } from 'aws-cdk-lib';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInfrastructure } from './stacks';
import type { HostingConfig } from './stacks';
import { selectGames } from '../build/publication';

const root = resolve(import.meta.dirname, '..');
const config: HostingConfig = JSON.parse(
  readFileSync(resolve(root, 'infra/config.json'), 'utf8'),
);
const expected = selectGames(
  JSON.parse(readFileSync(resolve(root, 'src/games.json'), 'utf8')),
  JSON.parse(
    readFileSync(resolve(root, 'config/production-games.json'), 'utf8'),
  ),
).map((game) => game.id);
const websiteDirectory = resolve(root, 'dist-production');
const built = JSON.parse(
  readFileSync(resolve(websiteDirectory, 'publication.json'), 'utf8'),
);
if (
  JSON.stringify(expected) !== JSON.stringify(built.games) ||
  built.origin !== `https://${config.domainName}`
)
  throw new Error(
    '本番ビルドと公開設定が一致しません。npm run build:production を実行してください。',
  );
if (!process.env.CDK_DEFAULT_ACCOUNT)
  throw new Error(
    'CDK_DEFAULT_ACCOUNT がありません。CDK CLIから --profile ai-dev で実行してください。',
  );
createInfrastructure(new App(), config, {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  websiteDirectory,
});
