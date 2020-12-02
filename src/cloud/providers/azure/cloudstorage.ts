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

import { TokenCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { Readable } from 'stream';

import { Config } from '../../config';
import { AzureCredentials } from './credentials';
import { AbstractStorage, StorageFactory } from '../../storage';
import { AzureDataEcosystemServices } from './dataecosystem';
import { TenantModel } from '../../../services/tenant';

@StorageFactory.register('azure')
export class AzureCloudStorage extends AbstractStorage {

    private AZURE_CONTAINER_PREFIX = 'ss-' + Config.SERVICE_ENV;
    private blobServiceClient: BlobServiceClient;
    private defaultAzureCredential: TokenCredential;
    private dataPartition: string;

    public async getBlobServiceClient(): Promise<BlobServiceClient> {
        if (!this.blobServiceClient) {
            const account = await AzureDataEcosystemServices.getStorageAccountName(this.dataPartition);
            this.blobServiceClient = new BlobServiceClient(
                `https://${account}.blob.core.windows.net`,
                this.defaultAzureCredential
            );
        }
        return this.blobServiceClient;
    }

    public constructor(tenant: TenantModel) {
        super();
        this.defaultAzureCredential = AzureCredentials.getCredential();
        this.dataPartition = tenant.esd.indexOf('.') !== -1 ? tenant.esd.split('.')[0] : tenant.esd;
    }

    // generate a random container name
    public randomBucketName(): string {
        let suffix = Math.random().toString(36).substring(2, 15);
        suffix = suffix + Math.random().toString(36).substring(2, 15);
        suffix = suffix.substr(0, 15);
        return this.AZURE_CONTAINER_PREFIX + '-' + suffix;
    }

    // Create a new container
    // [REVERT-DOWNSCOPE] change method signature with the commented one
    // public async createBucket(
    //     bucketName: string, location: string, storageClass: string): Promise<void> {
    public async createBucket(
        bucketName: string,
        location: string, storageClass: string,
        adminACL: string, editorACL: string, viewerACL: string): Promise<void> {
        const container = (await this.getBlobServiceClient()).getContainerClient(bucketName);
        await container.create();
    }

    // Delete a container
    public async deleteBucket(bucketName: string, force = false): Promise<void> {
        const container = (await this.getBlobServiceClient()).getContainerClient(bucketName);
        await container.delete();
    }

    // Delete all files in a container
    public async deleteFiles(bucketName: string): Promise<void> {
        const blobUrls = await this.generateBlobUrls(bucketName);
        if (!blobUrls.length) {
            return;
        }
        const batchClient = (await this.getBlobServiceClient()).getBlobBatchClient();
        await batchClient.deleteBlobs(blobUrls, this.defaultAzureCredential);
    }

    // Generate array of blob URLs used when deleting in batch
    public async generateBlobUrls(bucketName: string, prefix?: string): Promise<string[]> {
        const container = (await this.getBlobServiceClient()).getContainerClient(bucketName);
        let blobs = null;
        if (prefix) {
            blobs = container.listBlobsByHierarchy('/', { prefix });
        }
        else {
            blobs = container.listBlobsFlat();
        }
        const blobUrls = new Array();
        let blobItem = await blobs.next();
        while (!blobItem.done) {
            blobUrls.push(container.getBlobClient(blobItem.value.name).url);
            blobItem = await blobs.next();
        }
        return blobUrls;
    }

    // save an object/file/blob to a container
    public async saveObject(bucketName: string, objectName: string, data: string): Promise<void> {
        const streamData = Readable.from([data]);
        const container = (await this.getBlobServiceClient()).getContainerClient(bucketName);
        const blobClient = container.getBlobClient(objectName);
        const blockClient = blobClient.getBlockBlobClient();

        await blockClient.uploadStream(streamData);
    }

    // delete an object from a container
    public async deleteObject(bucketName: string, objectName: string): Promise<void> {
        const container = (await this.getBlobServiceClient()).getContainerClient(bucketName);
        const blobClient = container.getBlobClient(objectName);
        await blobClient.delete();
    }

    // delete multiple objects from a container
    public async deleteObjects(bucketName: string, prefix: string, async: boolean = false): Promise<void> {
        const blobUrls = await this.generateBlobUrls(bucketName, prefix);
        if (!blobUrls.length) {
            return;
        }
        const batchClient = (await this.getBlobServiceClient()).getBlobBatchClient();
        await batchClient.deleteBlobs(blobUrls, this.defaultAzureCredential);
    }

    /* copy multiple objects from one container to another
        TODO: Find out how ownerEmail is being used, it doesn't appear to be used in the GCS implementation
    */
    public async copy(bucketIn: string, prefixIn: string, bucketOut: string,
        prefixOut: string, ownerEmail: string): Promise<void> {
        const containerIn = (await this.getBlobServiceClient()).getContainerClient(bucketIn);
        const containerOut = (await this.getBlobServiceClient()).getContainerClient(bucketOut);
        const blobs = containerIn.listBlobsFlat({ prefix: prefixIn });
        const copyCalls = [];
        let blobItem = await blobs.next();
        while (!blobItem.done) {
            const blobClientIn = containerIn.getBlobClient(blobItem.value.name);
            const blobClientOut = containerOut.getBlobClient(blobItem.value.name.replace(prefixIn, prefixOut));
            copyCalls.push(blobClientOut.beginCopyFromURL(blobClientIn.url));
            blobItem = await blobs.next();
        }
        await Promise.all(copyCalls)
    }

    // check if a container exist
    public async bucketExists(bucketName: string): Promise<boolean> {
        const container = (await this.getBlobServiceClient()).getContainerClient(bucketName);
        return await container.exists();
    }

}
