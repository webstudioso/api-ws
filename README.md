 # Webstudio API WS
This API WS enables [Webstudio](https://webstudio.so) real time integrations with GPT and projects. It is built using AWS CDK.

# Welcome to your CDK JavaScript project

This is a blank project for CDK development with Typescript.

The `cdk.json` file tells the CDK Toolkit how to execute your app. The build step is not required when using JavaScript.

## Useful commands

* `npm run test`         perform the jest unit tests
* `cdk deploy`           deploy this stack to your default AWS account/region
* `cdk diff`             compare deployed stack with current state
* `cdk synth`            emits the synthesized CloudFormation template

## Building and Deploying

```
ROOT_DOMAIN=<domain> AWS_REGION=<region> ACM_ARN=<cert_arn> cdk bootstrap --profile <profile_name>
ROOT_DOMAIN=<domain> AWS_REGION=<region> ACM_ARN=<cert_arn> cdk synth --profile <profile_name>
ROOT_DOMAIN=<domain> AWS_REGION=<region> ACM_ARN=<cert_arn> cdk deploy --profile <profile_name>
```