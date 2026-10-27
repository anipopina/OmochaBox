import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const action = process.argv[2];
if (!['synth', 'diff', 'deploy'].includes(action))
  throw new Error('Unknown CDK command');
const config = JSON.parse(
  readFileSync(resolve(root, 'infra/config.json'), 'utf8'),
);
const result = spawnSync(
  process.execPath,
  [
    resolve(root, 'node_modules/aws-cdk/bin/cdk'),
    action,
    'OmochaBoxCertificate',
    'OmochaBoxProduction',
    '--profile',
    config.profile,
    ...(action === 'deploy' ? ['--require-approval', 'never'] : []),
  ],
  { cwd: root, stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
