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

import { AWSConfig } from './config';
import { AbstractStorage, StorageFactory } from '../../storage';
import { TenantModel } from '../../../services/tenant';
import AWS from 'aws-sdk/global';
import S3 from "aws-sdk/clients/s3";
import {AWSSSMhelper} from './ssmhelper';
@StorageFactory.register('aws')
export class AWSStorage extends AbstractStorage {

    private static bucketName: string;
    private s3: S3; // S3 service object

    public constructor(tenant: TenantModel) {
        super();
        AWS.config.update({ region: AWSConfig.AWS_REGION });
        this.s3 = new S3({ apiVersion: '2006-03-01' });
    }

    // get the bucketName from SSM
    private async getBucketName(): Promise<void> {
        if (AWSStorage.bucketName !== undefined)
            return;
        const awsSSMHelper = new AWSSSMhelper();
        AWSStorage.bucketName = await awsSSMHelper.getSSMParameter('/osdu/'+AWSConfig.AWS_ENVIRONMENT+'/seismic-store/seismic-s3-bucket-name');
        console.log(AWSStorage.bucketName);
    }

    private fixFolderFormat(folder: string): string {
        if (folder) {
            folder += '/';
            while (folder.indexOf('//') !== -1) {
                folder = folder.replace('//', '/');
            }
        }
        return folder;
    }

    // generate a random bucket name, for aws, a random folder name 
    public randomBucketName(): string {
        let suffix = Math.random().toString(36).substring(2, 16);
        suffix = suffix + Math.random().toString(36).substring(2, 16);
        suffix = suffix.substr(0, 16);
        return suffix;
    }

    // Create a new bucket, for aws, create a folder with folderName
    public async createBucket(
        folderName: string,
        location: string, storageClass: string,
        adminACL: string, editorACL: string, viewerACL: string): Promise<void> {

        await this.getBucketName();
        const params = {
            Bucket: AWSStorage.bucketName,
            Key: folderName + '/',
            Body: ''
        };
        try {
            await this.s3.putObject(params).promise();
        } catch (err) {
            console.log(err.code + ": " + err.message);
        }
    }

    // Delete a bucket, for aws, delete folder folderName 
    public async deleteBucket(folderName: string, force = false): Promise<void> {
        await this.getBucketName();
        if (force) {
            await this.deleteFiles(folderName);
        }
        const params = {
            Bucket: AWSStorage.bucketName,
            Key: folderName + '/'
        };
        try {
            await this.s3.deleteObject(params).promise();
        } catch (err) {
            console.log(err.code + ": " + err.message);
        }
    }

    // Delete all files in a bucket, for aws, delete all files in the folder
    public async deleteFiles(folderName: string): Promise<void> {
        await this.getBucketName();
        const params = {
            Bucket: AWSStorage.bucketName,
            Prefix: folderName + '/'
        };
        const listedObjects = await this.s3.listObjectsV2(params).promise();
        if (listedObjects.Contents.length === 0)
            return;

        const deleteParams = {
            Bucket: AWSStorage.bucketName,
            Delete: { Objects: [] }
        };

        listedObjects.Contents.forEach(({ Key }) => {
            deleteParams.Delete.Objects.push({ Key });
        });

        await this.s3.deleteObjects(deleteParams).promise();

        if (listedObjects.IsTruncated)  //continue delete files as there are more...
            await this.deleteFiles(folderName);
    }

    // save an object/file to a bucket
    public async saveObject(folderName: string, objectName: string, data: string): Promise<void> {
        await this.getBucketName();
        const params = {
            Bucket: AWSStorage.bucketName,
            Key: folderName + '/' + objectName,
            Body: data
        };
        try {
            this.s3.putObject(params).promise();
        } catch (err) {
            console.log(err.code + ": " + err.message);
        }
    }

    // delete an object from a bucket 
    public async deleteObject(folderName: string, objectName: string): Promise<void> {
        await this.getBucketName();
        const params = {
            Bucket: AWSStorage.bucketName,
            Key: folderName + '/' + objectName
        };
        try {
            this.s3.deleteObject(params).promise();
        } catch (err) {
            console.log(err.code + ": " + err.message);
        }
    }

    // delete multiple objects
    public async deleteObjects(folderName: string, prefix: string, async: boolean = false): Promise<void> {
        await this.getBucketName();

        const params = {
            Bucket: AWSStorage.bucketName,
            Prefix: folderName + '/' + prefix
        };
        const listedObjects = await this.s3.listObjectsV2(params).promise();

        if (listedObjects.Contents.length === 0) return;

        const deleteParams = {
            Bucket: AWSStorage.bucketName,
            Delete: { Objects: [] }
        };

        listedObjects.Contents.forEach(({ Key }) => {
            deleteParams.Delete.Objects.push({ Key });
        });

        await this.s3.deleteObjects(deleteParams).promise();

        if (listedObjects.IsTruncated) //continue delete files as there are more...
            await this.deleteObjects(folderName, prefix, async);
    }

    // copy multiple objects (skip the dummy file)
    public async copy(folderIn: string, prefixIn: string, folderOut: string, prefixOut: string, ownerEmail: string) {
        await this.getBucketName();

        prefixIn = this.fixFolderFormat(prefixIn);
        prefixOut = this.fixFolderFormat(prefixOut);

        const copyCalls = [];
        const params = {
            Bucket: AWSStorage.bucketName,
            Prefix: folderIn + '/' + prefixIn
        };
        const files = await this.s3.listObjects(params).promise();

        for (const file of files['Contents']) {
            var newKey = file.Key.replace(folderIn, folderOut);
            newKey = newKey.replace(prefixIn, prefixOut);
            const params = {
                Bucket: AWSStorage.bucketName,
                CopySource: file.Key,
                Key: newKey
            };
            copyCalls.push(this.s3.copyObject(params));
        }
        await Promise.all(copyCalls);
    }

    // check if a bucket exist, for aws, check if folder in the bucket
    // folderName is a string without / at the end
    public async bucketExists(folderName: string): Promise<boolean> {
        await this.getBucketName();
        const params = {
            Bucket: AWSStorage.bucketName,
            Prefix: folderName
        };

        const listedObjects = await this.s3.listObjectsV2(params).promise();
        if (listedObjects.Contents.length === 0)
            return false;
        return true;
    }

}
