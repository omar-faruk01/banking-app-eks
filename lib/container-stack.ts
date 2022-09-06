import { EksProps } from './cluster-stack';
import { App, Stack, StackProps } from 'aws-cdk-lib';
import { readYamlFromDir } from '../utils/read-file';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as path from "path";
import { readFileSync } from "fs";

export class ContainerStack extends Stack {
    constructor(app: App, id: string, props: EksProps ) {
        super(app, id, props);

        const cluster = props.cluster;
        const commonFolder = './yaml-common/';
        const regionFolder = `./yaml-${Stack.of(this).region}/`;

        readYamlFromDir(commonFolder, cluster);
        readYamlFromDir(regionFolder, cluster);

        // fluxcd to amke sure all pods have neccessary configurations
        cluster.addHelmChart(`flux`, {
            repository: 'https://charts.fluxcd.io',
            chart: 'flux',
            release: 'flux',
            values: {
            'git.url':'git@github.com\:org/repo'
            }
        });
        

    }
}
