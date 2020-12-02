// ============================================================================
// Copyright 2017-2019, Schlumberger
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
// ============================================================================

import { CloudFactory } from './cloud';

export interface IStorage {
    // [REVERT-DOWNSCOPE] use the commented createBucket method (remove the other)
    // createBucket(
    //     bucketName: string, location: string, storageClass: string): Promise<void>;
    createBucket(
        bucketName: string, location: string, storageClass: string,
        adminACL: string, editorACL: string, viewerACL: string): Promise<void>;
    deleteBucket(bucketName: string): Promise<void>;
    deleteBucket(bucketName: string): void;
    bucketExists(bucketName: string): Promise<boolean>;
    deleteFiles(bucketName: string): Promise<void>;
    deleteObject(bucketName: string, objectName: string): Promise<void>;
    deleteObjects(bucketName: string, prefix: string): Promise<void>;
    saveObject(bucketName: string, objectName: string, data: string): Promise<void>;
    copy(bucketIn: string, prefixIn: string, bucketOut: string, prefixOut: string, ownerEmail: string): Promise<void>;
    randomBucketName(): string;
}

export abstract class AbstractStorage implements IStorage {
    // [REVERT-DOWNSCOPE] use the commented createBucket method (remove the other)
    // public abstract async createBucket(
    //     bucketName: string, location: string, storageClass: string): Promise<void>;
    public abstract async createBucket(
        bucketName: string, location: string, storageClass: string,
        adminACL: string, editorACL: string, viewerACL: string): Promise<void>;
    public abstract async deleteBucket(bucketName: string):  Promise<void>;
    public abstract async bucketExists(bucketName: string): Promise<boolean>;
    public abstract async deleteFiles(bucketName: string):  Promise<void>;
    public abstract async deleteObject(bucketName: string, objectName: string):  Promise<void>;
    public abstract async deleteObjects(bucketName: string, prefix: string):  Promise<void>;
    public abstract async saveObject(bucketName: string, objectName: string, data: string):  Promise<void>;
    public abstract async copy(
        bucketIn: string, prefixIn: string, bucketOut: string,
        prefixOut: string, ownerEmail: string):  Promise<void>;
    public abstract randomBucketName(): string;
}

export class StorageFactory extends CloudFactory {
    public static build(providerLabel: string, args: { [key: string]: any } = {}): IStorage {
        return CloudFactory.build(providerLabel, AbstractStorage, args) as IStorage;
    }
}
