import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { createInfrastructure, routingCode } from '../infra/stacks.ts';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(
  readFileSync(join(root, 'infra/config.json'), 'utf8'),
);
const outdir = await mkdtemp(join(tmpdir(), 'omochabox-infra-'));
try {
  const app = new App({ outdir });
  const stacks = createInfrastructure(app, config, {
    account: '111111111111',
    hostedZoneId: 'ZTESTONLY',
    websiteDirectory: join(root, 'dist-production'),
  });
  app.synth();
  const cert = Template.fromStack(stacks.certificates),
    site = Template.fromStack(stacks.website);
  assert.equal(stacks.certificates.region, 'us-east-1');
  assert.equal(stacks.website.region, 'ap-northeast-1');
  cert.hasResourceProperties('AWS::CertificateManager::Certificate', {
    DomainName: config.domainName,
    ValidationMethod: 'DNS',
  });
  site.hasResourceProperties('AWS::S3::Bucket', {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
    BucketEncryption: Match.anyValue(),
  });
  site.hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Retain' });
  site.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
    OriginAccessControlConfig: Match.objectLike({
      SigningBehavior: 'always',
      SigningProtocol: 'sigv4',
    }),
  });
  site.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({
      Aliases: [config.domainName],
      DefaultCacheBehavior: Match.objectLike({
        ViewerProtocolPolicy: 'redirect-to-https',
      }),
      CustomErrorResponses: Match.arrayWith([
        Match.objectLike({
          ErrorCode: 403,
          ResponseCode: 404,
          ResponsePagePath: '/404.html',
        }),
      ]),
    }),
  });
  for (const resource of Object.values(site.toJSON().Resources)) {
    if (resource.Type === 'AWS::CloudFront::Distribution')
      assert.equal(resource.Properties.DistributionConfig.Logging, undefined);
    if (resource.Type === 'AWS::S3::Bucket')
      assert.equal(resource.Properties.LoggingConfiguration, undefined);
  }
  site.hasResourceProperties('Custom::CDKBucketDeployment', {
    Prune: true,
    DistributionPaths: ['/*'],
  });
  site.hasResourceProperties('AWS::Route53::RecordSet', {
    Type: 'A',
    Name: config.domainName + '.',
  });
  site.hasResourceProperties('AWS::Route53::RecordSet', {
    Type: 'AAAA',
    Name: config.domainName + '.',
  });
  const handler = runInNewContext(routingCode + ';handler');
  assert.equal(
    handler({ request: { uri: '/ponpon-stamp/' } }).uri,
    '/ponpon-stamp/index.html',
  );
  assert.equal(
    handler({ request: { uri: '/ponpon-stamp' } }).headers.location.value,
    '/ponpon-stamp/',
  );
  assert.equal(
    handler({ request: { uri: '/assets/test.js' } }).uri,
    '/assets/test.js',
  );
  console.log(
    'Infrastructure PASS: offline synth, Tokyo S3, US-East certificate, OAC, HTTPS, DNS, no access logs, removal/pruning and cache invalidation, MPA routes/404',
  );
} finally {
  await rm(outdir, { recursive: true, force: true });
}
