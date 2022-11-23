import sinon from 'sinon';

import { CosmosClient, Container, SqlQuerySpec, SqlParameter, FeedOptions, Item, Items, QueryIterator, FeedResponse } from '@azure/cosmos';
import {
    AbstractJournal, AbstractJournalTransaction,
    IJournalQueryModel, IJournalTransaction, JournalFactory
} from '../../../../src/cloud/journal';
import { Utils } from '../../../../src/shared/utils'
import { TenantModel } from '../../../../src/services/tenant/index';
import { AzureDataEcosystemServices } from '../../../../src/cloud/providers/azure/dataecosystem';
import { AzureConfig } from '../../../../src/cloud/providers/azure/config';
import { Config } from '../../../../src/cloud';
import { AzureCosmosDbDAORegular, AzureCosmosDbQueryRegular } from '../../../../src/cloud/providers/azure/cosmosdb-regular';
import { Tx } from '../../utils';
import { assert } from 'chai';
import { throws } from 'assert';

export class TestAzureCosmosDbDAORegular {
    private static sandbox: sinon.SinonSandbox;
    private static cosmos: AzureCosmosDbDAORegular;

    public static run() {

        describe(Tx.testInit('azure cosmos db dao regular test'), () => {
            Config.CLOUDPROVIDER = 'azure';
            this.sandbox = sinon.createSandbox();
            this.cosmos = new AzureCosmosDbDAORegular({ gcpid: 'gcpid', default_acls: 'x', esd: 'gcpid@domain.com', name: 'gcpid' });

            beforeEach(() => {
                this.sandbox.stub(AzureCosmosDbDAORegular.prototype, 'getCosmoContainer').resolves(
                    new Container(undefined, 'id', undefined));
            });

            afterEach(() => {
                this.sandbox.restore();
            });

            this.save();
            this.get();
            this.delete();
            this.createQuery();
            this.runQuery();
            this.createKey();

        });
    };

    private static save() {
        const mockEntity = {
            key: {
                name: "testPartitionKeyName",
                partitionKey: 'testPartitionKey',
                id: 'testId'
            },
            data: {
                id: 'test',
                ctag: "0000000000000000"
            },
            ctag: "0000000000000000"
        }

        Tx.sectionInit('save');

        Tx.test(async (done: any) => {
            this.sandbox.stub(Items.prototype, 'upsert').resolves(mockEntity.data as any);
            this.cosmos.save(mockEntity).then(res => {
                done();
            });
        });
    };

    private static get() {
        Tx.sectionInit('get');
        const key = {
            id: 'testId',
            partitionKey: 'testKey',
            kind: 'testKind'
        };

        Tx.test(async (done: any) => {
            const mockResult = {
                resource: {
                    data: {
                        id: 'testId',
                        param: 'testParam'
                    }
                }
            } as any;

            this.sandbox.stub(Item.prototype, 'read').returns(mockResult);
            const [result] = await this.cosmos.get(key);
            assert.deepEqual(mockResult.resource.data, result, 'Get returned wrong object');
            done();
        });

        Tx.test(async (done: any) => {
            const mockResult = {
                resource: undefined,
                statusCode: 404
            } as any;

            this.sandbox.stub(Item.prototype, 'read').returns(Promise.resolve(mockResult));
            const [res] = await this.cosmos.get(key);
            Tx.checkTrue(res === undefined, done);
        });
    };

    private static delete() {
        Tx.sectionInit('delete');

        Tx.test(async (done: any) => {
            this.sandbox.stub(Item.prototype, 'delete').resolves();
            await this.cosmos.delete({ partitionKey: 'entity' });
            done();
        });
    };

    private static createQuery() {
        Tx.sectionInit('createQuery');

        Tx.test( (done: any) => {
            let res = this.cosmos.createQuery("namespace", "kind");
            Tx.checkTrue(res !== undefined, done);
        });

    };

    private static runQuery() {
        Tx.sectionInit('runQuery');

        let feedResponse: FeedResponse<any> = {
            resources: ["resources"],
            headers: undefined,
            hasMoreResults: false,
            continuation: '',
            continuationToken: 'continuationToken',
            queryMetrics: '',
            requestCharge: 0,
            activityId: ''
        } as any;
        
        let queryIterator: QueryIterator<any> = {
            fetchNext: function (): Promise<FeedResponse<any>> {
                return Promise.resolve(feedResponse);
            }
        } as any;

        let azureCosmosDbQueryRegular = {
            filter: function (property: string, value: {}): AzureCosmosDbQueryRegular {
                throw new Error('Function not implemented.');
            },
            start: function (start: string | Buffer): AzureCosmosDbQueryRegular {
                throw new Error('Function not implemented.');
            },
            limit: function (n: number): AzureCosmosDbQueryRegular {
                throw new Error('Function not implemented.');
            },
            groupBy: function (fieldNames: string | string[]): AzureCosmosDbQueryRegular {
                throw new Error('Function not implemented.');
            },
            select: function (fieldNames: string | string[]): AzureCosmosDbQueryRegular {
                throw new Error('Function not implemented.');
            },
            filters: [],
            projectedFieldNames: [],
            groupByFieldNames: [],
            namespace: 'namespace',
            kind: 'datasets',
            prepareSqlStatement: function (tableName: string): { spec: SqlQuerySpec; options: FeedOptions; } {
                let spec: SqlQuerySpec = { query: '' };
                let options: FeedOptions = {};
                return ({spec, options});
            }
        };

        Tx.test( async(done: any) => {
            this.sandbox.stub(Items.prototype, 'query').returns(queryIterator);
            let output = await this.cosmos.runQuery(azureCosmosDbQueryRegular);
            Tx.checkTrue(output !== undefined, done);
        });

    };

    private static createKey() {
        Tx.sectionInit('create key');

        Tx.test(async (done: any) => {
            const specs = {
                namespace: 'testNamespace',
                path: [AzureConfig.DATASETS_KIND, 'dsName']
            }

            const expectedKey = { name: 'ws2vlmnTpgoQf41X', partitionKey: 'testNamespace-datasets', kind: "datasets" }

            this.sandbox.stub(Utils, "makeID").returns("ws2vlmnTpgoQf41X");
            const key = this.cosmos.createKey(specs);
            assert.deepEqual(key, expectedKey, 'Keys do not match');
            done();
        });

        Tx.test(async (done: any) => {
            const specs = {
                namespace: 'testNamespace',
                path: [AzureConfig.SEISMICMETA_KIND, 'skName']
            }

            const expectedKey = { name: 'skName', partitionKey: 'testNamespace-seismicmeta', kind: "seismicmeta" }

            const key = this.cosmos.createKey(specs);
            assert.deepEqual(key, expectedKey, 'Keys do not match');
            done();
        });

        Tx.test(async (done: any) => {
            const specs = {
                namespace: 'testNamespace',
                path: [AzureConfig.APPS_KIND, 'apName']
            }

            const expectedKey = { name: 'apName', partitionKey: 'testNamespace-apps', kind: "apps" }

            const key = this.cosmos.createKey(specs);
            assert.deepEqual(key, expectedKey, 'Keys do not match');
            done();
        });

    };

};