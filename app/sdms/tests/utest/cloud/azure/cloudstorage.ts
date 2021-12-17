import sinon from 'sinon';

import { ContainerClient, BlobClient, BlockBlobClient, BlobBatchClient, BlobServiceClient } from '@azure/storage-blob';
import { AzureCloudStorage, AzureCredentials } from '../../../../src/cloud/providers/azure';
import { Config } from '../../../../src/cloud';
import { Tx } from '../../utils';

export class TestAzureStorage {
    private static sandbox: sinon.SinonSandbox;
    private static storage: AzureCloudStorage;

    public static run() {

        describe(Tx.testInit('azure cloud storage test'), () => {
            Config.CLOUDPROVIDER = 'azure';
            this.sandbox = sinon.createSandbox();
            this.sandbox.stub(AzureCredentials, 'getCredential').resolves()
            this.storage = new AzureCloudStorage({ gcpid: 'gcpid', default_acls:'x', esd: 'gcpid@domain.com', name: 'gcpid'});

            beforeEach(()=> {
                this.sandbox.stub(AzureCloudStorage.prototype, 'getBlobServiceClient').resolves(
                    new BlobServiceClient(`https://` + undefined + `.blob.core.windows.net`));
            })

            afterEach(() => {
                this.sandbox.restore();
            });

            this.createBucket();
            this.deleteBucket();
            this.saveObject();
            this.bucketExists();
            this.deleteFiles();
            this.deleteObjects();
        });
    }

    private static createBucket() {
        // [REVERT-DOWNSCOPE] re-enable this test
        // Tx.sectionInit('createBucket');
        // Tx.test(async (done: any) => {
        //     this.sandbox.stub(ContainerClient.prototype, 'create').resolves();
        //     await this.storage.createBucket('entity','location','storageclass');
        //     done();
        // });
    }

    private static deleteBucket() {
        Tx.sectionInit('deleteBucket');
        Tx.test(async (done: any) => {
            this.sandbox.stub(ContainerClient.prototype, 'delete').resolves();
            await this.storage.deleteBucket('entity');
            done();
        });
    }

    private static saveObject() {
        Tx.sectionInit('saveObject');
        Tx.test(async (done: any) => {
            this.sandbox.stub(BlockBlobClient.prototype, 'uploadStream').resolves();
            await this.storage.saveObject('entity', 'name', 'data');
            done();
        });
    }

    private static bucketExists() {
        Tx.sectionInit('bucketExists');
        Tx.test(async (done: any) => {
            this.sandbox.stub(ContainerClient.prototype, 'exists').resolves();
            await this.storage.bucketExists('entity');
            done();
        });
    }

    private static deleteFiles() {
        Tx.sectionInit('deleteFiles');
        Tx.test(async (done: any) => {
            this.sandbox.stub(AzureCloudStorage.prototype, 'generateBlobUrls').resolves(
            ['url1','url2','url3']);
            this.sandbox.stub(BlobBatchClient.prototype, 'deleteBlobs').resolves();
            await this.storage.deleteFiles('entity');
            done();
        });
    }

    private static deleteObjects() {
        Tx.sectionInit('deleteObjects');
        Tx.test(async (done: any) => {
            this.sandbox.stub(AzureCloudStorage.prototype, 'generateBlobUrls').resolves(
            ['url1','url2','url3']);
            this.sandbox.stub(BlobBatchClient.prototype, 'deleteBlobs').resolves();
            await this.storage.deleteObjects('entity', 'prefix');
            done();
        });
    }

}
