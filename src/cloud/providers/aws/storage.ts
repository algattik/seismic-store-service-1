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


import {AbstractStorage, StorageFactory} from '../../storage';

@StorageFactory.register('aws')
export class AWSStorage extends AbstractStorage {
    async bucketExists(bucketName: string): Promise<boolean> {
        return undefined;
    }

    // tslint:disable-next-line:max-line-length
    async copy(bucketIn: string, prefixIn: string, bucketOut: string, prefixOut: string, ownerEmail: string): Promise<void> {
        return undefined;
    }

    // tslint:disable-next-line:max-line-length
    async createBucket(bucketName: string, location: string, storageClass: string, adminACL: string, editorACL: string, viewerACL: string): Promise<void> {
        return undefined;
    }

    async deleteBucket(bucketName: string): Promise<void>;
    deleteBucket(bucketName: string): void;
    deleteBucket(bucketName: string): Promise<void> | void {
        return undefined;
    }

    async deleteFiles(bucketName: string): Promise<void> {
        return undefined;
    }

    async deleteObject(bucketName: string, objectName: string): Promise<void> {
        return undefined;
    }

    async deleteObjects(bucketName: string, prefix: string): Promise<void> {
        return undefined;
    }

    randomBucketName(): string {
        return '';
    }

    async saveObject(bucketName: string, objectName: string, data: string): Promise<void> {
        return undefined;
    }

}