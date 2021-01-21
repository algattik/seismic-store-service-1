// Copyright © 2020 Amazon Web Services
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

import { Config } from '../../../cloud';
import { Error, Utils } from '../../../shared';
import { AbstractCredentials, CredentialsFactory, IAccessTokenModel } from '../../credentials';
import { AWSConfig } from './config';
import {AWSSSMhelper} from './ssmhelper';
import {AWSSTShelper} from './stshelper';


@CredentialsFactory.register('aws')
export class AWSCredentials extends AbstractCredentials {

    private awsSSMHelper = new AWSSSMhelper();
    private awsSTSHelper = new AWSSTShelper();

    getAudienceForImpCredentials(): string {
        return '';
    }

    getIAMResourceUrl(serviceSigner: string): string {
        return '';
    }

    getPublicKeyCertificatesUrl(): string {
        return '';
    }

    async getServiceAccountAccessToken(): Promise<IAccessTokenModel> {
        return undefined;
    }

    async getUserCredentials(subject: string): Promise<IAccessTokenModel> {
        //subject = tenantName:subprojectName:1 ==> readOnly true
        //subject = tenantName:subprojectName:0 ==> readOnly false
        const s3bucket = await this.awsSSMHelper.getSSMParameter('/osdu/'+AWSConfig.AWS_ENVIRONMENT+'/seismic-store/seismic-s3-bucket-name')
        const expDuration = await this.awsSSMHelper.getSSMParameter('/osdu/'+AWSConfig.AWS_ENVIRONMENT+'/seismic-store/temp-cred-expiration-duration')
        const vars = subject.split(':')
        const tenant = vars[0];
        const subproject = vars[1];
        const readOnly = vars[2];
        var roleArn='';
        var credentials='';

        var flagUpload=true;

        const keypath = tenant+'/'+subproject;
        // tslint:disable-next-line:triple-equals
        if(readOnly ==='1') { // readOnly True
             roleArn = await this.awsSSMHelper.getSSMParameter('/osdu/' + AWSConfig.AWS_ENVIRONMENT + '/seismic-store/iam/download-role-arn')
            flagUpload = false;
        } else if (readOnly ==='0')  // readOnly False
        {
            roleArn = await this.awsSSMHelper.getSSMParameter('/osdu/' + AWSConfig.AWS_ENVIRONMENT + '/seismic-store/iam/upload-role-arn')
            flagUpload = true;
        }

        credentials = await this.awsSTSHelper.getCredentials(s3bucket,keypath,roleArn,flagUpload,expDuration);


            const result = {
            access_token: credentials,
            expires_in: 3599,
            token_type: 'STSToken',
        };
        return result;
    }

    // this will return serviceprincipal access token
    public async getServiceCredentials(): Promise<string> {
        return ''
    }
}