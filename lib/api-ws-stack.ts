import * as cdk from 'aws-cdk-lib';
import { EndpointType } from 'aws-cdk-lib/aws-apigateway';
import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Effect } from 'aws-cdk-lib/aws-iam';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import * as path from 'path';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

const StackProps = { 
  env: { 
    account: process.env.AWS_ACCOUNT, 
    region: process.env.AWS_REGION
}}

export interface WebsocketProps {
  wssDomainName: string;
  certificate: cdk.aws_certificatemanager.ICertificate;
  zone: cdk.aws_route53.IHostedZone;
}

export class ApiWsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, StackProps);

    // table
    const api = new cdk.aws_apigatewayv2.CfnApi(this, 'WebstudioWSAPI', {
      name: 'WebstudioWSAPI',
      description: "Webstudio API Real Time for studio, GPT, etc",
      protocolType: 'WEBSOCKET',
      routeSelectionExpression: '$request.body.action',
    });

    // table
    const table = new cdk.aws_dynamodb.Table(this, 'Connections', {
      tableName: 'Connections',
      partitionKey: {
        name: 'ConnectionId',
        type: cdk.aws_dynamodb.AttributeType.STRING
      },
      readCapacity: 5,
      writeCapacity: 5,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // connect lambda
    const connectLambda = new cdk.aws_lambda.Function(this, 'WSConnectLambda', {
      functionName: 'WSConnectLambda',
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, './../lambda')),
      handler: 'connect.handler',
      runtime: cdk.aws_lambda.Runtime.PYTHON_3_8,
      timeout: cdk.Duration.seconds(300),
      memorySize: 512,
      environment: {
        TABLE_NAME: table.tableName
      }
    });

    table.grantReadWriteData(connectLambda);

    // disconnect lambda
    const disconnectLambda = new cdk.aws_lambda.Function(this, 'WSDisconnectLambda', {
      functionName: 'WSDisconnectLambda',
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, './../lambda')),
      handler: 'disconnect.handler',
      runtime: cdk.aws_lambda.Runtime.PYTHON_3_8,
      timeout: cdk.Duration.seconds(300),
      memorySize: 512,
      environment: {
        TABLE_NAME: table.tableName
      }
    });

    table.grantReadWriteData(disconnectLambda);

    // message lambda
    const messageLambda = new cdk.aws_lambda.Function(this, 'WSMessageLambda', {
      functionName: 'WSMessageLambda',
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, './../lambda')),
      handler: 'message.handler',
      runtime: cdk.aws_lambda.Runtime.PYTHON_3_8,
      timeout: cdk.Duration.seconds(300),
      memorySize: 256,
      environment: {
        TABLE_NAME: table.tableName,
        ENDPOINT_URL: `https://${api.ref}.execute-api.${this.region}.amazon.com/dev`
      },
      initialPolicy: [
        new cdk.aws_iam.PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["execute-api:ManageConnections"],
          resources: ["*"]
        })
      ]
    });

    table.grantReadWriteData(messageLambda);

    // role for APIG to access lambdas
    const role = new cdk.aws_iam.Role(this, "RoleForAPIGToInvokeLambda", {
      roleName:"InvokeLambdaRoleForApiGw",
      assumedBy: new cdk.aws_iam.ServicePrincipal("apigateway.amazonaws.com")
    });

    role.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: Effect.ALLOW,
        resources: [
          connectLambda.functionArn,
          disconnectLambda.functionArn,
          messageLambda.functionArn
        ],
        actions: ["lambda:InvokeFunction"]
      })
    );

    // connection integration
    const connectIntegration = new cdk.aws_apigatewayv2.CfnIntegration(this, "ConnectLambdaIntegration", {
      apiId: api.ref,
      integrationType: "AWS_PROXY",
      integrationUri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${connectLambda.functionArn}/invocations`,
      credentialsArn: role.roleArn
    });

    // disconnection integration
    const disconnectIntegration = new cdk.aws_apigatewayv2.CfnIntegration(this, "DisconnectLambdaIntegration", {
      apiId: api.ref,
      integrationType: "AWS_PROXY",
      integrationUri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${disconnectLambda.functionArn}/invocations`,
      credentialsArn: role.roleArn
    });

    // message integration
    const messageIntegration = new cdk.aws_apigatewayv2.CfnIntegration(this, "MessageLambdaIntegration", {
      apiId: api.ref,
      integrationType: "AWS_PROXY",
      integrationUri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${messageLambda.functionArn}/invocations`,
      credentialsArn: role.roleArn
    });

    // routes
    const connectRoute = new cdk.aws_apigatewayv2.CfnRoute(this, "ConnectRoute", {
      apiId: api.ref,
      routeKey: "$connect",
      authorizationType: "NONE",
      target: `integrations/${connectIntegration.ref}`
    });

    const disconnectRoute = new cdk.aws_apigatewayv2.CfnRoute(this, "DisconnectRoute", {
      apiId: api.ref,
      routeKey: "$disconnect",
      authorizationType: "NONE",
      target: `integrations/${disconnectIntegration.ref}`
    });

    const messageRoute = new cdk.aws_apigatewayv2.CfnRoute(this, "MessageRoute", {
      apiId: api.ref,
      routeKey: "message",
      authorizationType: "NONE",
      target: `integrations/${messageIntegration.ref}`
    });

    // deployment stage
    const deployment = new cdk.aws_apigatewayv2.CfnDeployment(this, "deployment", {
      apiId: api.ref
    })

    const stage = new cdk.aws_apigatewayv2.CfnStage(this, "DevStage", {
      stageName: "dev",
      deploymentId: deployment.ref,
      apiId: api.ref,
      autoDeploy: true
    })

    // we need 3 routes ready before deployment
    deployment.node.addDependency(connectRoute)
    deployment.node.addDependency(disconnectRoute)
    deployment.node.addDependency(messageRoute)

    // custom domain wss://wsapi.webstudio.so
    const certificateArn = process.env.ACM_ARN || ""
    const domainName = process.env.ROOT_DOMAIN || "";
    const customDomainName = `wsapi.${domainName}`;
    const zone = HostedZone.fromLookup(this, 'HostedZone', { domainName });
  
    const domain = new cdk.aws_apigatewayv2.CfnDomainName(this, "apigatewaydomainsocket", {
      domainName,
      domainNameConfigurations:[{
        certificateArn: certificateArn,
        endpointType: 'REGIONAL'
      }]
    });
    
    const apiMapping = new cdk.aws_apigatewayv2.CfnApiMapping(this, "swapiMapping", {
      domainName: domain.ref,
      apiId: api.ref,
      stage: stage.ref
    });

    // const zone = new cdk.aws_route53.PublicHostedZone(this, 'HostedZone', {
    //   zoneName: domainName
    // });
    
    const route = new cdk.aws_route53.CnameRecord(this, "wsapiRoute", {
      recordName: "wsapi",
      zone,
      domainName: domain.attrRegionalDomainName
    });

    // const certificate = cdk.aws_certificatemanager.Certificate.fromCertificateArn(this, 'wsapi-cert', certificateArn)

    // const domainName = new cdk.aws_apigateway.DomainName(this, 'DomainName', {
    //   domainName: customDomainName,
    //   certificate
    //   // certificate
    // });

    // const mapping = new cdk.aws_apigatewayv2.CfnApiMapping(this, 'Mapping', {
    //   apiId: api.ref,
    //   stage: stage.stageName,
    //   domainName: domainName.domainName
    // });
    // mapping.addDependency(domainName);

    // new cdk.aws_route53.ARecord(this, "wsapiDNS", {
    //   zone,
    //   recordName: 'wsapi',
    //   target: cdk.aws_route53.RecordTarget.fromAlias({
    //     bind: (_record) => ({
    //       hostedZoneId: zone.hostedZoneId,
    //       dnsName: api.ref,
    //     }),
    //   }),
    // });

    // output
    new cdk.CfnOutput(this, "wssEndpoint", {
      exportName: "wssEndpoint",
      value: `wss://${customDomainName}`
      // value:`wss://${api.ref}.execute-api.${this.region}.amazon.com/dev`
    })
  }
}
