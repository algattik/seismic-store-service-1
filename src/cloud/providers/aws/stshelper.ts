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

import AWS from 'aws-sdk/global';
import {AWSConfig} from './config';
import {STS} from 'aws-sdk';



export class AWSSTShelper {

    private sts: STS;

    public constructor() {
        AWS.config.update({ region: AWSConfig.AWS_REGION });
        this.sts = new STS({apiVersion: '2014-11-06'});
    }

    public async getCredentials(bucketName: string, keypath: string, roleArn: string, flagUpload: boolean, exp: string): Promise<string> {
        var policy;

        if(flagUpload === true)
             policy = this.createUploadPolicy(bucketName,keypath);
        else
            policy = this.createDownloadPolicy(bucketName,keypath);

        var expDuration: number = +exp;

        let stsParams = {
            ExternalId: "OSDUAWS",
            Policy: policy,
            RoleArn: roleArn,
            RoleSessionName: "OSDUAWSAssumeRoleSession",
            DurationSeconds: expDuration
        };
        const roleCreds =  await this.sts.assumeRole(stsParams).promise();
        const tempCreds= roleCreds.Credentials.AccessKeyId+':'+roleCreds.Credentials.SecretAccessKey+':'+roleCreds.Credentials.SessionToken;


      return tempCreds;
    }


    public  createUploadPolicy(bucketName: string, keypath: string): string {

        var UploadPolicy = {
            Version: "2012-10-17",
            Statement: [
                {
                    Sid: "One",     // Statement 1: Allow Listing files at the file location
                    Effect: "Allow",
                    Action: [
                        "s3:ListBucketVersions",
                        "s3:ListBucket"
                    ],
                    Resource: [
                        "arn:aws:s3:::"+bucketName
                    ],
                    Condition: {
                        StringEquals: {
                            's3:prefix': keypath+'/'
                        }
                    }
                },
                {
                    Sid: "Two", //Statement 2: Allow Listing files under the file location
                    Effect: "Allow",
                    Action: [
                        "s3:*"
                    ],
                    Resource: [
                        "arn:aws:s3:::"+bucketName
                    ],
                    Condition: {
                        StringLike: {
                            's3:prefix': keypath+'/*'
                        }
                    }

                },
                {
                    Sid: "Three",  //Statement 3: Allow Uploading files at the file location
                    Effect: "Allow",
                    Action: [
                        "s3:PutObject",
                        "s3:ListBucketMultipartUploads",
                        "s3:AbortMultipartUpload",
                        "s3:ListMultipartUploadParts"
                    ],
                    Resource: [
                        "arn:aws:s3:::"+bucketName+"/"+keypath+"/"
                    ]
                },
                {
                    Sid: "Four",   //Statement 4: Allow Uploading files under the file location
                    Effect: "Allow",
                    Action: [
                        "s3:PutObject",
                        "s3:ListBucketMultipartUploads",
                        "s3:AbortMultipartUpload",
                        "s3:ListMultipartUploadParts"
                    ],
                    Resource: [
                        "arn:aws:s3:::"+bucketName+"/"+keypath+"/*"
                    ]
                }
            ]
        };


        const policy = JSON.stringify(UploadPolicy);
        return policy;
    }

    public  createDownloadPolicy(bucketName: string, keypath: string): string {

        var DownloadPolicy = {
            Version: "2012-10-17",
            Statement: [
                {
                    Sid: "One",     // Statement 1: Allow Listing files at the file location
                    Effect: "Allow",
                    Action: [
                        "s3:ListBucketVersions",
                        "s3:ListBucket"
                    ],
                    Resource: [
                        "arn:aws:s3:::"+bucketName
                    ],
                    Condition: {
                        StringEquals: {
                            's3:prefix': keypath+'/'
                        }
                    }
                },
                {
                    Sid: "Two", //Statement 2: Allow Listing files under the file location
                    Effect: "Allow",
                    Action: [
                        "s3:*"
                    ],
                    Resource: [
                        "arn:aws:s3:::"+bucketName
                    ],
                    Condition: {
                        StringLike: {
                            's3:prefix': keypath+'/*'
                        }
                    }

                },
                {
                    Sid: "Three",  //Statement 3: Allow Downloading files at the file location
                    Effect: "Allow",
                    Action: [
                        "s3:GetObject",
                        "s3:GetObjectVersion"
                    ],
                    Resource: [
                        "arn:aws:s3:::"+bucketName+"/"+keypath+"/"
                    ]
                },
                {
                    Sid: "Four",   //Statement 4: Allow Downloading files under the file location
                    Effect: "Allow",
                    Action: [
                        "s3:GetObject",
                        "s3:GetObjectVersion"
                    ],
                    Resource: [
                        "arn:aws:s3:::"+bucketName+"/"+keypath+"/*"
                    ]
                }
            ]
        };


        const policy = JSON.stringify(DownloadPolicy);
        return policy;
    }


}