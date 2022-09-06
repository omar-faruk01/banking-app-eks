import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as codecommit from "aws-cdk-lib/aws-codecommit";
import {
  CodePipeline,
  CodePipelineSource,
  CodeBuildStep,
  ManualApprovalStep,
  ShellStep
} from "aws-cdk-lib/pipelines";
import * as pipelineAction from "aws-cdk-lib/aws-codepipeline-actions";
import * as iam from "aws-cdk-lib/aws-iam";
import { Stack } from "aws-cdk-lib";
import { codeToECRspec, deployToEKSspec } from '../utils/buildspecs';
import codepipeline = require('aws-cdk-lib/aws-codepipeline');
import * as ecr from "aws-cdk-lib/aws-ecr"
import { CicdProps } from './cluster-stack';
import { Construct } from "constructs";
import * as cdk from 'aws-cdk-lib';



export class CicdStack extends Stack {

    constructor(scope: Construct, id: string, props: CicdProps) {
        super(scope, id, props);

        const primaryRegion = 'us-west-2';
        const secondaryRegion = 'us-east-2';

        const PyRepo = new codecommit.Repository(this, 'py-for-bootcamp', {
            repositoryName: `pyBootCamp-${Stack.of(this).region}`
        });

        new cdk.CfnOutput(this, `codecommit-uri`, {
            exportName: 'CodeCommitURL',
            value: PyRepo.repositoryCloneUrlHttp
        });
        const ecrForMainRegion = new ecr.Repository(this, `ecr-for-bootcamp-py`);

        const buildForECR = codeToECRspec(this, ecrForMainRegion.repositoryUri);
        ecrForMainRegion.grantPullPush(buildForECR.role!);

        const deployToMainCluster = deployToEKSspec(this, primaryRegion, props.firstRegionCluster, ecrForMainRegion, props.firstRegionRole);
        const deployTo2ndCluster = deployToEKSspec(this, secondaryRegion, props.secondRegionCluster, ecrForMainRegion, props.secondRegionRole);

        const sourceOutput = new codepipeline.Artifact();
        new codepipeline.Pipeline(this, 'multi-region-eks-dep', {
            stages: [ {
                    stageName: 'Source',
                    actions: [ new pipelineAction.CodeCommitSourceAction({
                            actionName: 'CatchSourcefromCode',
                            repository: PyRepo,
                            output: sourceOutput,
                        })]
                },{
                    stageName: 'Build',
                    actions: [ new pipelineAction.CodeBuildAction({
                        actionName: 'BuildAndPushtoECR',
                        input: sourceOutput,
                        project: buildForECR
                    })]
                },
                {
                    stageName: 'DeployToMainEKScluster',
                    actions: [ new pipelineAction.CodeBuildAction({
                        actionName: 'DeployToMainEKScluster',
                        input: sourceOutput,
                        project: deployToMainCluster
                    })]
                },
                {
                    stageName: 'ApproveToDeployTo2ndRegion',
                    actions: [ new pipelineAction.ManualApprovalAction({
                            actionName: 'ApproveToDeployTo2ndRegion'
                    })]
                },
                {
                    stageName: 'DeployTo2ndRegionCluster',
                    actions: [ new pipelineAction.CodeBuildAction({
                        actionName: 'DeployTo2ndRegionCluster',
                        input: sourceOutput,
                        project: deployTo2ndCluster
                    })]
                }
                
            ]
        });

    }
}