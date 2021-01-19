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

@StorageFactory.register('aws')
export class AWSStorage extends AbstractStorage {

    private projectID: string;
    private BUCKET_PREFIX = 'ss-' + AWSConfig.SERVICE_ENV;
    private s3: S3;

    public constructor(tenant: TenantModel) {
        super();
        this.projectID = tenant.gcpid;
        AWS.config.update({ region: AWSConfig.AWS_REGION });
        // Create S3 service object
        this.s3 = new S3({ apiVersion: '2006-03-01' });
    }

    // generate a random bucket name
    public randomBucketName(): string {
        let suffix = Math.random().toString(36).substring(2, 16);
        suffix = suffix + Math.random().toString(36).substring(2, 16);
        suffix = suffix.substr(0, 16);
        return this.BUCKET_PREFIX + '-' + suffix;
    }

    // Create a new bucket
    public async createBucket(
        bucketName: string,
        location: string, storageClass: string,
        adminACL: string, editorACL: string, viewerACL: string): Promise<void> {

        const create_bucket_params = {
            Bucket: bucketName,
        };
        try {
            await this.s3.createBucket(create_bucket_params).promise();
        } catch (err) {
            console.log(err.code + ": " + err.message);
        }
        // var params = {
        //     Bucket: bucketName,
        //     GrantFullControl: adminACL,
        //     GrantWrite: editorACL,
        //     GrantRead: viewerACL
        // };
        // await this.s3.putBucketAcl(params).promise();
    }

    // Delete a bucket 
    public async deleteBucket(bucketName: string, force = false): Promise<void> {
        if (force) {
            await this.deleteFiles(bucketName);
        }
        const delete_bucket_params = { Bucket: bucketName };
        try {
            await this.s3.deleteBucket(delete_bucket_params).promise();
        } catch (err) {
            console.log(err.code + ": " + err.message);
        }
    }

    // Delete all files in a bucket
    public async deleteFiles(bucketName: string): Promise<void> {
        console.log("start to delete all files in " + bucketName);
        const params = { Bucket: bucketName };
        const listedObjects = await this.s3.listObjectsV2(params).promise();
        if (listedObjects.Contents.length === 0)
            return;

        const deleteParams = {
            Bucket: bucketName,
            Delete: { Objects: [] }
        };

        listedObjects.Contents.forEach(({ Key }) => {
            deleteParams.Delete.Objects.push({ Key });
        });

        await this.s3.deleteObjects(deleteParams).promise();

        if (listedObjects.IsTruncated)  //continue delete files as there are more...
            await this.deleteFiles(bucketName);
    }

    // save an object/file to a bucket, object name contains path
    public async saveObject(bucketName: string, objectName: string, data: string): Promise<void> {
        const params = { Bucket: bucketName, Key: objectName, Body: data };
        try {
            this.s3.putObject(params).promise();
        } catch (err) {
            console.log(err.code + ": " + err.message);
        }
    }

    // delete an object from a bucket
    public async deleteObject(bucketName: string, objectName: string): Promise<void> {
        const params = { Bucket: bucketName, Key: objectName };
        try {
            this.s3.deleteObject(params).promise();
        } catch (err) {
            console.log(err.code + ": " + err.message);
        }
    }

    // delete multiple objects, prefix should end with /
    public async deleteObjects(bucketName: string, prefix: string, async: boolean = false): Promise<void> {
        console.log("start deleteObjects in " + prefix + " in bucket " + bucketName);

        const params = { Bucket: bucketName, Prefix: prefix };
        const listedObjects = await this.s3.listObjectsV2(params).promise();

        if (listedObjects.Contents.length === 0) return;

        const deleteParams = {
            Bucket: bucketName,
            Delete: { Objects: [] }
        };

        listedObjects.Contents.forEach(({ Key }) => {
            deleteParams.Delete.Objects.push({ Key });
        });

        await this.s3.deleteObjects(deleteParams).promise();

        if (listedObjects.IsTruncated) //continue delete files as there are more...
            await this.deleteObjects(bucketName, prefix);
    }

    // copy multiple objects (skip the dummy file)
    public async copy(bucketIn: string, prefixIn: string, bucketOut: string, prefixOut: string, ownerEmail: string) {
        if (prefixIn) {
            prefixIn += '/';
            while (prefixIn.indexOf('//') !== -1) {
                prefixIn = prefixIn.replace('//', '/');
            }
        }
        if (prefixOut) {
            prefixOut += '/';
            while (prefixOut.indexOf('//') !== -1) {
                prefixOut = prefixOut.replace('//', '/');
            }
        }
        const copyCalls = [];
        const params = { Bucket: bucketIn, Prefix: prefixIn };
        const files = await this.s3.listObjects(params).promise();

        for (const file of files[0]) {
            const params = {
                Bucket: bucketOut,
                CopySource: bucketIn + '/' + file.Key,
                Key: file.Key.replace(prefixIn, prefixOut)
            };
            copyCalls.push(this.s3.copyObject(params));
        }
        await Promise.all(copyCalls);
    }

    // check if a bucket exist
    public async bucketExists(bucketName: string): Promise<boolean> {
        const bucket_params = { Bucket: bucketName };
        try {
            await this.s3.headBucket(bucket_params).promise();
            return true;
        } catch (err) {
            if (err.statusCode === 404) { //404 if the bucket does not exist
                return false;
            }
        }
        return true;
    }

}
