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

import { Storage } from '@google-cloud/storage';
import { ConfigGoogle } from './config';
import { AbstractStorage, StorageFactory } from '../../storage';
import { TenantModel } from '../../../services/tenant';

@StorageFactory.register('google')
export class GCS extends AbstractStorage {

    private KMaxResults = 100;
    private GCS_BUCKET_PREFIX = 'ss-' + ConfigGoogle.SERVICE_ENV;
    private projectID: string;

    private static clientsCache: { [key: string]: Storage; } = {};

    public constructor(tenant: TenantModel) {
        super();
        this.projectID = tenant.gcpid
    }

    private getStorageclient(): Storage {
        if (GCS.clientsCache[this.projectID]) {
            return GCS.clientsCache[this.projectID];
        } else {
            GCS.clientsCache[this.projectID] = new Storage({
                keyFilename: ConfigGoogle.SERVICE_IDENTITY_KEY_FILENAME,
                projectId: this.projectID,
            });
            return GCS.clientsCache[this.projectID];
        }
    }

    // generate a random bucket name
    public randomBucketName(): string {
        let suffix = Math.random().toString(36).substring(2, 16);
        suffix = suffix + Math.random().toString(36).substring(2, 16);
        suffix = suffix.substr(0, 16);
        return this.GCS_BUCKET_PREFIX + '-' + suffix;
    }

    // Create a new bucket
    // [REVERT-DOWNSCOPE] replace the signature method
    // public async createBucket(
    //     bucketName: string, location: string, storageClass: string): Promise<void> {
    public async createBucket(
        bucketName: string,
        location: string, storageClass: string,
        adminACL: string, editorACL: string, viewerACL: string): Promise<void> {
        const bucket = this.getStorageclient().bucket(bucketName);

        await bucket.create({ location, storageClass });

        // [REVERT-DOWNSCOPE] remove this block until line "await bucket.iam.setPolicy(policy)" included
        const [policy] = await bucket.iam.getPolicy();
        policy.bindings.push(
            {
                members: ['group:' + adminACL, 'group:' + editorACL, 'group:' + viewerACL],
                role: 'roles/storage.legacyObjectReader',
            },
            { members: ['group:' + adminACL], role: 'roles/storage.legacyBucketOwner' },
            { members: ['group:' + editorACL], role: 'roles/storage.legacyBucketWriter' },
            { members: ['group:' + viewerACL], role: 'roles/storage.legacyBucketReader' });
        await bucket.iam.setPolicy(policy);

        // [REVERT-DOWNSCOPE] add this commented section
        // await bucket.setMetadata({
        //     iamConfiguration: {
        //         uniformBucketLevelAccess: {
        //             enabled: true
        //         }
        //     }
        // });
    }

    // Delete a bucket
    public async deleteBucket(bucketName: string, force = false): Promise<void> {
        await this.getStorageclient().bucket(bucketName).delete();
    }

    // Delete all files in a bucket
    public async deleteFiles(bucketName: string): Promise<void> {
        await this.getStorageclient().bucket(bucketName).deleteFiles();
    }

    // save an object/file to a bucket
    public async saveObject(bucketName: string, objectName: string, data: string): Promise<void> {
        // Create and save the file
        await this.getStorageclient().bucket(bucketName).file(objectName).save(data);
    }

    // delete an object from a bucket
    public async deleteObject(bucketName: string, objectName: string): Promise<void> {
        await this.getStorageclient().bucket(bucketName).file(objectName).delete();
    }

    // delete multiple objects
    public async deleteObjects(bucketName: string, prefix: string, async: boolean = false): Promise<void> {
        prefix = prefix ? (prefix + '/').replace('//', '/') : prefix;
        if (async) {
            await this.getStorageclient().bucket(bucketName).deleteFiles({ prefix, force: true });
        } else {
            this.getStorageclient().bucket(bucketName).deleteFiles({ prefix, force: true });
        }
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

        const rmPrefixIn = prefixIn ? prefixIn !== '/' : false;

        const bucketFrom = this.getStorageclient().bucket(bucketIn);
        const bucketTo = bucketIn === bucketOut ? undefined : this.getStorageclient().bucket(bucketOut);

        const copyCalls = [];
        let nextPageToken = '';
        let fileNameTo = '';
        do {
            const files = await bucketFrom.getFiles(
                { maxResults: this.KMaxResults, prefix: prefixIn, pageToken: nextPageToken });
            for (const file of files[0]) {
                fileNameTo = prefixOut ? prefixOut : '';
                fileNameTo = fileNameTo + (rmPrefixIn ? file.name.substr(prefixIn.length) : file.name);
                copyCalls.push(file.copy(bucketTo ? bucketTo.file(fileNameTo) : fileNameTo));
            }
            await Promise.all(copyCalls);
            nextPageToken = files[2].nextPageToken;
        } while (nextPageToken);

    }

    // check if a bucket exist
    public async bucketExists(bucketName: string): Promise<boolean> {
        const result = await this.getStorageclient().bucket(bucketName).exists();
        return result[0];
    }

}
