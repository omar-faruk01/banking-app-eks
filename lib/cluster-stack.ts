import { App, Stack, StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { PhysicalName } from 'aws-cdk-lib';
import { Construct } from "constructs";
import { AWSLoadBalancerController } from "./infrastructure/alb-controller";
import { ClusterAutoscaler } from "./infrastructure/cluster-autoscaler";
import { ContainerInsights } from "./infrastructure/container-insights";
import { Calico } from "./infrastructure/calico";
import { Prometheus } from "./infrastructure/prometheus";

export class ClusterStack extends Stack {

  public readonly cluster: eks.Cluster;
  public readonly firstRegionRole: iam.Role;
  public readonly secondRegionRole: iam.Role;

  constructor(
    scope: Construct,
    id: string,
    props?: StackProps
  ) {
    super(scope, id, props);

    const primaryRegion = 'us-west-2';
    
    const vpc = new ec2.Vpc(this, "Vpc", { maxAzs: 3 });

    const clusterAdmin = new iam.Role(this, 'EKSAdminRole', {
      assumedBy: new iam.AccountRootPrincipal()     
    });
    
    clusterAdmin.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKS_CNI_Policy")
    );

    clusterAdmin.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    );
    
    clusterAdmin.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKSWorkerNodePolicy")
    );
    
    clusterAdmin.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonEC2ContainerRegistryReadOnly"
      )
    );
    
    
    const cluster = new eks.Cluster(this, 'bootcamp-cluster', {
        clusterName: `bootcampDemo`,
        mastersRole: clusterAdmin,
        version: eks.KubernetesVersion.V1_21,
        defaultCapacity: 2,
        vpc,
        vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_NAT}],
        clusterLogging: [
          eks.ClusterLoggingTypes.API,
          eks.ClusterLoggingTypes.AUTHENTICATOR,
          eks.ClusterLoggingTypes.SCHEDULER,
        ]
      }
    );
    
    cluster.addNodegroupCapacity('spot-ng', {
      instanceTypes: [
        new ec2.InstanceType('m5.large'),
        new ec2.InstanceType('m5a.large')
      ],
      minSize: 2,
      maxSize: 6,
      capacityType: eks.CapacityType.SPOT
    })
    
    this.cluster = cluster;
    
    // Container Network Insights with Calico
    const awsNodeCniPatch = new eks.KubernetesPatch(
      this,
      "serviceAccount/aws-node",
      {
        cluster,
        resourceName: "serviceAccount/aws-node",
        resourceNamespace: "kube-system",
        applyPatch: {
          metadata: {
            annotations: {
              "eks.amazonaws.com/role-arn": clusterAdmin.roleArn,
            },
          },
        },
        restorePatch: {
          metadata: {
            annotations: {},
          },
        },
      }
    );
    
        
    const awsAuth = new eks.AwsAuth(this, 'MyAwsAuth', {
      cluster: cluster,
  });

    // AWS ALB Controller
     new AWSLoadBalancerController(this, "AWSLoadBalancerController", {
      cluster: cluster,
    });
    
    // Cluster Autoscaler
    new ClusterAutoscaler(this, "ClusterAutoscaler", {
      cluster: cluster,
    });
    
    // Container Insights
    new ContainerInsights(this, "ContainerInsights", {
      cluster: cluster,
    });
    
    // Calico CNI
    new Calico(this, "Calico", {
      cluster: cluster,
    });
    
    // Prometheus
    new Prometheus(this, "Prometheus", {
      cluster: cluster,
    });

    if (Stack.of(this).region==primaryRegion) {
      this.firstRegionRole = createDeployRole(this, `for-1st-region`, cluster);
    }
    else {
      this.secondRegionRole = createDeployRole(this, `for-2nd-region`, cluster);
    }
  }
}

function createDeployRole(scope: Construct, id: string, cluster: eks.Cluster): iam.Role {
  const role = new iam.Role(scope, id, {
    roleName: PhysicalName.GENERATE_IF_NEEDED,
    assumedBy: new iam.AccountRootPrincipal()
  });
  cluster.awsAuth.addMastersRole(role);

  return role;
}

export interface EksProps extends StackProps {
  cluster: eks.Cluster
}

export interface CicdProps extends StackProps {
  firstRegionCluster: eks.Cluster,
  secondRegionCluster: eks.Cluster,
  firstRegionRole: iam.Role,
  secondRegionRole: iam.Role
}