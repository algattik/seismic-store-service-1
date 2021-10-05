// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { AbstractCredentials, CredentialsFactory, IAccessTokenModel } from '../../credentials';
import { AWSConfig } from './config';
import {AWSSSMhelper} from './ssmhelper';
import {AWSSTShelper} from './stshelper';

import DynamoDB from 'aws-sdk/clients/dynamodb';

import aws from 'aws-sdk';

@CredentialsFactory.register('aws')
export class AWSCredentials extends AbstractCredentials {

    private awsSSMHelper = new AWSSSMhelper();
    private awsSTSHelper = new AWSSTShelper();

    // [OBSOLETE] to remove with /imptoken
    getAudienceForImpCredentials(): string {
        return '';
    }

    // [OBSOLETE] to remove with /imptoken
    getIAMResourceUrl(serviceSigner: string): string {
        return '';
    }

    // [OBSOLETE] to remove with /imptoken
    getPublicKeyCertificatesUrl(): string {
        return '';
    }

    // [OBSOLETE] to remove with /imptoken
    async getServiceAccountAccessToken(): Promise<IAccessTokenModel> {
        return undefined;
    }

    async getBucketFolder(folder:string): Promise<string> {
        const tableName = AWSConfig.AWS_ENVIRONMENT+'-SeismicStore.'+AWSConfig.SUBPROJECTS_KIND;
        const params = {
            TableName: tableName,
            Key: {
                'id': {S: folder}
            }
        };
        const db = new DynamoDB({});
        const data = await db.getItem(params).promise();
        const ret = aws.DynamoDB.Converter.unmarshall(data.Item);
        if (Object.keys(ret).length === 0){
            // tslint:disable-next-line:no-console
            console.log('error to get folder: '+folder+'\n');
            return undefined;
        }
        else{
            const vars = ret['gcs_bucket'].split('$$');
            return vars[1];
        }
    }

    public async getStorageCredentials(
        tenant: string, subproject: string,
        bucket: string, readonly: boolean, _partition: string): Promise<IAccessTokenModel> {
            const s3bucket = await this.awsSSMHelper.getSSMParameter('/osdu/'+AWSConfig.AWS_ENVIRONMENT+'/seismic-store/seismic-s3-bucket-name')
            const expDuration = await this.awsSSMHelper.getSSMParameter('/osdu/'+AWSConfig.AWS_ENVIRONMENT+'/seismic-store/temp-cred-expiration-duration')
            let roleArn='';
            let credentials='';

            let flagUpload=true;

            const keyPath =  await this.getBucketFolder(tenant+':'+subproject);

            // tslint:disable-next-line:triple-equals
            if(readonly ) { // readOnly True
                 roleArn = await this.awsSSMHelper.getSSMParameter('/osdu/' + AWSConfig.AWS_ENVIRONMENT + '/seismic-store/iam/download-role-arn')
                flagUpload = false;
            } else   // readOnly False
            {
                roleArn = await this.awsSSMHelper.getSSMParameter('/osdu/' + AWSConfig.AWS_ENVIRONMENT + '/seismic-store/iam/upload-role-arn')
                flagUpload = true;
            }

            credentials = await this.awsSTSHelper.getCredentials(s3bucket, keyPath,roleArn,flagUpload,expDuration);

                const result = {
                access_token: credentials,
                expires_in: 3599,
                token_type: 'Bearer',
            };
            return result;
    }

}