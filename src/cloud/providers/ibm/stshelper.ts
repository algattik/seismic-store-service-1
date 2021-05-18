import { IbmConfig } from './config';
import {STS} from 'aws-sdk';


export class IBMSTShelper{

    private sts: STS;

    public constructor() {
        this.sts = new STS({apiVersion: '2014-11-06',
                            endpoint: IbmConfig.COS_ENDPOINT,
                            accessKeyId: IbmConfig.COS_SUBUSER_ACCESS_KEY_ID,
                            secretAccessKey: IbmConfig.COS_SUBUSER_SECRET_ACCESS_KEY,
                            region: 'us-south',});
    }

    public async getCredentials(bucketName: string, keypath: string,
        roleArn: string, flagUpload: boolean, exp: string): Promise<string> {
        let policy;

        if(flagUpload === true)
             policy = this.createUploadPolicy(bucketName,keypath);
        else
            policy = this.createDownloadPolicy(bucketName,keypath);

         // hardcoded policy
         // policy= '{"Version":"2012-10-17","Statement":
         // [{"Sid":"Stmt1","Effect":"Allow","Action":"s3:*","Resource":"arn:aws:s3:::*"}]}'  ;
        const expDuration: number = +exp;

        const stsParams = {
            ExternalId: 'OSDUAWS',
            Policy: policy,
            RoleArn: roleArn,
            RoleSessionName: 'OSDUAWSAssumeRoleSession',
            DurationSeconds: expDuration
        };
        const roleCreds =  await this.sts.assumeRole(stsParams).promise();
        const tempCreds= roleCreds.Credentials.AccessKeyId+':'+roleCreds.Credentials.SecretAccessKey
        +':'+roleCreds.Credentials.SessionToken;


      return tempCreds;
    }


    public  createUploadPolicy(bucketName: string, keypath: string): string {

        const UploadPolicy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Sid: 'One',     // Statement 1: Allow Listing files at the file location
                    Effect: 'Allow',
                    Action: [
                        's3:ListBucket'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName
                    ]
                },
                {
                    Sid: 'Two', // Statement 2: Allow Listing files under the file location
                    Effect: 'Allow',
                    Action: [
                        's3:*'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName
                    ]

                },
                {
                    Sid: 'Three',  // Statement 3: Allow Uploading files at the file location
                    Effect: 'Allow',
                    Action: [
                        's3:PutObject',
                        's3:DeleteObject',
                        's3:GetObject',
                        's3:ListBucketMultipartUploads',
                        's3:AbortMultipartUpload',
                        's3:ListMultipartUploadParts'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName
                    ]
                },
                {
                    Sid: 'Four',   // Statement 4: Allow Uploading files under the file location
                    Effect: 'Allow',
                    Action: [
                        's3:PutObject',
                        's3:DeleteObject',
                        's3:GetObject',
                        's3:ListBucketMultipartUploads',
                        's3:AbortMultipartUpload',
                        's3:ListMultipartUploadParts'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName+'/*'
                    ]
                }
            ]
        };


        const policy = JSON.stringify(UploadPolicy);
        return policy;
    }


    public  createDownloadPolicy(bucketName: string, keypath: string): string {

        const downloadPolicy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Sid: 'One',     // Statement 1: Allow Listing files at the file location
                    Effect: 'Allow',
                    Action: [
                        's3:ListBucket'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName
                    ]
                },
                {
                    Sid: 'Two', // Statement 2: Allow Listing files under the file location
                    Effect: 'Allow',
                    Action: [
                        's3:*'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName
                    ]

                },
                {
                    Sid: 'Three',  // Statement 3: Allow Downloading files at the file location
                    Effect: 'Allow',
                    Action: [
                        's3:GetObject',
                        's3:GetObjectVersion'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName
                    ]
                },
                {
                    Sid: 'Four',   // Statement 4: Allow Downloading files under the file location
                    Effect: 'Allow',
                    Action: [
                        's3:GetObject',
                        's3:GetObjectVersion'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName+'/*'
                    ]
                }
            ]
        };


        const policy = JSON.stringify(downloadPolicy);
        return policy;
    }







}
