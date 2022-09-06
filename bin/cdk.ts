#!/usr/bin/env node
import "source-map-support/register";

import { App } from "aws-cdk-lib";
import { ClusterStack } from '../lib/cluster-stack';
import { ContainerStack } from '../lib/container-stack';
import { CicdStack } from '../lib/cicd-stack';



const app = new App();

const primaryRegion = {account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-west-2'};
const secondaryRegion = {account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-2'};

// Deploy stack to first region
const primaryCluster=new ClusterStack(
  app,
  `ClusterStack-${primaryRegion.region}`, 
  {env: primaryRegion }  
);

new ContainerStack(
  app,
  `ContainerStack-${primaryRegion.region}`,
  { 
    env: primaryRegion,
    cluster: primaryCluster.cluster
  }
);

// Deploy stack to second region
const secondaryCluster=new ClusterStack(
  app,
  `ClusterStack-${secondaryRegion.region}`, 
  {env: secondaryRegion }  
);

new ContainerStack(
  app,
  `ContainerStack-${secondaryRegion.region}`,
  { 
    env: secondaryRegion,
    cluster: secondaryCluster.cluster
  }
);

new CicdStack(app, `CicdStack`, {env: primaryRegion, 
    firstRegionCluster: primaryCluster.cluster,
    secondRegionCluster: secondaryCluster.cluster,
    firstRegionRole: primaryCluster.firstRegionRole,
    secondRegionRole: secondaryCluster.secondRegionRole});

app.synth();

