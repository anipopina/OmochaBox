import { App, CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as deployment from 'aws-cdk-lib/aws-s3-deployment';

export interface HostingConfig {
  domainName: string;
  hostedZoneName: string;
  region: string;
  profile: string;
}

export const routingCode = `function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith('/')) request.uri += 'index.html';
  else if (uri.split('/').pop().indexOf('.') === -1) {
    return {statusCode:301, statusDescription:'Moved Permanently', headers:{location:{value:uri+'/'}}};
  }
  return request;
}`;

export function createInfrastructure(
  app: App,
  config: HostingConfig,
  options: {
    account: string;
    websiteDirectory: string;
    hostedZoneId?: string;
  },
) {
  const common = { crossRegionReferences: true, terminationProtection: true };
  const certificates = new Stack(app, 'OmochaBoxCertificate', {
    ...common,
    env: { account: options.account, region: 'us-east-1' },
  });
  const website = new Stack(app, 'OmochaBoxProduction', {
    ...common,
    env: { account: options.account, region: config.region },
  });
  const zoneFor = (stack: Stack) =>
    options.hostedZoneId
      ? route53.HostedZone.fromHostedZoneAttributes(stack, 'Zone', {
          hostedZoneId: options.hostedZoneId,
          zoneName: config.hostedZoneName,
        })
      : route53.HostedZone.fromLookup(stack, 'Zone', {
          domainName: config.hostedZoneName,
          privateZone: false,
        });
  const certificate = new acm.Certificate(certificates, 'Certificate', {
    domainName: config.domainName,
    validation: acm.CertificateValidation.fromDns(zoneFor(certificates)),
  });
  const bucket = new s3.Bucket(website, 'Content', {
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
    encryption: s3.BucketEncryption.S3_MANAGED,
    enforceSSL: true,
    removalPolicy: RemovalPolicy.RETAIN,
  });
  const routing = new cloudfront.Function(website, 'DirectoryIndexes', {
    code: cloudfront.FunctionCode.fromInline(routingCode),
    runtime: cloudfront.FunctionRuntime.JS_2_0,
  });
  const distribution = new cloudfront.Distribution(website, 'Distribution', {
    domainNames: [config.domainName],
    certificate,
    defaultRootObject: 'index.html',
    enableLogging: false,
    minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    defaultBehavior: {
      origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      compress: true,
      functionAssociations: [
        {
          function: routing,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        },
      ],
    },
    errorResponses: [403, 404].map((httpStatus) => ({
      httpStatus,
      responseHttpStatus: 404,
      responsePagePath: '/404.html',
      ttl: Duration.seconds(0),
    })),
  });
  new deployment.BucketDeployment(website, 'Publish', {
    sources: [
      deployment.Source.asset(options.websiteDirectory, {
        exclude: ['.vite/**', 'publication.json'],
      }),
    ],
    destinationBucket: bucket,
    // Prune and invalidate together remove games withdrawn from the allowlist.
    prune: true,
    retainOnDelete: true,
    distribution,
    distributionPaths: ['/*'],
    cacheControl: [deployment.CacheControl.noCache()],
  });
  const zone = zoneFor(website);
  const target = route53.RecordTarget.fromAlias(
    new targets.CloudFrontTarget(distribution),
  );
  new route53.ARecord(website, 'IPv4', {
    zone,
    recordName: config.domainName,
    target,
  });
  new route53.AaaaRecord(website, 'IPv6', {
    zone,
    recordName: config.domainName,
    target,
  });
  new CfnOutput(website, 'URL', { value: `https://${config.domainName}/` });
  new CfnOutput(website, 'DistributionId', {
    value: distribution.distributionId,
  });
  new CfnOutput(website, 'BucketName', { value: bucket.bucketName });
  return { certificates, website };
}
