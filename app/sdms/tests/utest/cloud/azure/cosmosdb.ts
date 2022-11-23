// ============================================================================
// Copyright 2017-2021, Schlumberger
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

import sinon from 'sinon';
import crypto from 'crypto'

import { Conflict, Container, ContainerDefinition, ContainerResponse, FeedOptions, FeedResponse, Item, Items, OfferResponse, PartitionedQueryExecutionInfo, PartitionKeyDefinition, PartitionKeyRange, QueryIterator, RequestOptions, ResourceResponse, Response, SqlQuerySpec } from '@azure/cosmos';
import { AzureCosmosDbDAO, AzureCosmosDbQuery } from '../../../../src/cloud/providers/azure/cosmosdb';
import { AzureDataEcosystemServices } from '../../../../src/cloud/providers/azure';
import { Config } from '../../../../src/cloud';
import { IJournalQueryModel } from '../../../../src/cloud/journal';
import { Tx } from '../../utils';
import { assert } from 'chai';
import { AzureConfig } from '../../../../src/cloud/providers/azure';

export class TestAzureCosmosDbDAO {
    private static sandbox: sinon.SinonSandbox;
    private static cosmos: AzureCosmosDbDAO;

    public static run() {

        describe(Tx.testInit('azure cosmos db dao test'), () => {
            Config.CLOUDPROVIDER = 'azure';
            this.sandbox = sinon.createSandbox();
            this.cosmos = new AzureCosmosDbDAO({ gcpid: 'gcpid', default_acls: 'x', esd: 'gcpid@domain.com', name: 'gcpid' });

            beforeEach(() => {
                this.sandbox.stub(AzureCosmosDbDAO.prototype, 'getCosmoContainer').resolves(
                    new Container(undefined, 'id', undefined));
            })

            afterEach(() => {
                this.sandbox.restore();
            });

            this.save();
            this.get();
            this.delete();
            this.createQuery();
            this.runQuery();
            this.createKey();
            this.getTransaction();
            this.getQueryFilterSymbolContains();
        });
    }

    private static save() {
        const mockEntity = {
            key: {
                partitionKey: 'testPartitionKey',
                id: 'testId'
            },
            data: {
                id: 'test'
            }
        }

        Tx.sectionInit('save');

        Tx.test(async (done: any) => {
            this.sandbox.stub(Items.prototype, 'upsert').resolves(mockEntity.data as any);
            this.cosmos.save(mockEntity).then(res => {
                done();
            }).catch(err => {
                assert.fail(err)
                done();
            });
        });

        Tx.test(async (done: any) => {
            //this.sandbox.stub(Items.prototype, 'upsert').resolves(mockEntity.data as any);
            AzureConfig.SIDECAR_ENABLE_INSERT = true;
            this.sandbox.stub(AzureDataEcosystemServices, "getCosmosConnectionParams").resolves({ endpoint: "endpoint", key: "key" });
            mockEntity.key.partitionKey = "ds-testPartitionKey";
            await this.cosmos.save(mockEntity).then(res => {
                done();
            }).catch(err => {
                done();
                assert.fail(err)
            })
        });
    }

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

        Tx.test(async (done: any) => {
            const key2 = { id: 'testId', partitionKey: 'ds-testKey', kind: 'testKind' };
            const mockResult = {
                resource: {
                    data: {
                        id: 'testId',
                        param: 'testParam'
                    }
                }
            } as any;

            AzureConfig.SIDECAR_ENABLE_GET = true;
            this.sandbox.stub(AzureDataEcosystemServices, "getCosmosConnectionParams").resolves({ endpoint: "endpoint", key: "key" });
            this.sandbox.stub(Item.prototype, 'read').returns(mockResult);
            await this.cosmos.get(key2).then(res => {
                done();
            }).catch(err => {
                done();
                assert.fail(err)
            });
        });

    }

    private static delete() {
        Tx.sectionInit('delete');

        Tx.test(async (done: any) => {
            this.sandbox.stub(Item.prototype, 'delete').resolves();
            await this.cosmos.delete({ partitionKey: 'entity' });
            done();
        });

        Tx.test(async (done: any) => {
            AzureConfig.SIDECAR_ENABLE_DELETE = true;
            this.sandbox.stub(AzureDataEcosystemServices, "getCosmosConnectionParams").resolves({ endpoint: "endpoint", key: "key" });
            await this.cosmos.delete({ partitionKey: 'ds-partitionKey' }).then(res => {
                done();
            }).catch(err => {
                done();
                assert.fail(err)
            });
        });
    }

    private static createQuery() {
        Tx.sectionInit('createQuery');

        Tx.test( (done: any) => {
            let res = this.cosmos.createQuery("namespace", "kind");
            Tx.checkTrue(res !== undefined, done);
        });

    }

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
            clientContext: undefined,
            query: undefined,
            options: undefined,
            fetchFunctions: undefined,
            fetchAllTempResources: undefined,
            fetchAllLastResHeaders: undefined,
            queryExecutionContext: undefined,
            queryPlanPromise: undefined,
            isInitialized: undefined,
            getAsyncIterator: function (): AsyncIterable<FeedResponse<any>> {
                throw new Error('Function not implemented.');
            },
            hasMoreResults: function (): boolean {
                throw new Error('Function not implemented.');
            },
            fetchAll: function (): Promise<FeedResponse<any>> {
                return Promise.resolve(feedResponse);
            },
            fetchNext: function (): Promise<FeedResponse<any>> {
                return Promise.resolve(feedResponse);
            },
            reset: function (): void {
                throw new Error('Function not implemented.');
            },
            toArrayImplementation: undefined,
            createPipelinedExecutionContext: undefined,
            fetchQueryPlan: undefined,
            needsQueryPlan: undefined,
            initPromise: undefined,
            init: undefined,
            _init: undefined,
            handleSplitError: undefined
        } as any;
        let azureCosmosDbQuery: AzureCosmosDbQuery = {
            filter: function (property: string, operator?: ('CONTAINS' | '=' | '<' | '>' | '<=' | '>=' | 'HAS_ANCESTOR' | 'RegexMatch') | undefined, value?: {} | undefined): IJournalQueryModel {
                throw new Error('Function not implemented.');
            },
            start: function (start: string | Buffer): IJournalQueryModel {
                throw new Error('Function not implemented.');
            },
            limit: function (n: number): IJournalQueryModel {
                throw new Error('Function not implemented.');
            },
            groupBy: function (fieldNames: string | string[]): IJournalQueryModel {
                throw new Error('Function not implemented.');
            },
            select: function (fieldNames: string | string[]): IJournalQueryModel {
                throw new Error('Function not implemented.');
            },
            filters: [],
            projectedFieldNames: ["fieldName1"],
            groupByFieldNames: ["groupfieldName1"],
            namespace: 'namespace',
            pagingStart: '"[pagingStart]"',
            pagingLimit: 1,
            kind: ''
        };

        Tx.test( async(done: any) => {
            azureCosmosDbQuery.kind = "subprojects";
            this.sandbox.stub(Items.prototype, 'query').returns(queryIterator);
            let res = await this.cosmos.runQuery(azureCosmosDbQuery as IJournalQueryModel);
            Tx.checkTrue(res[1].endCursor === "continuationToken", done);
        });

        Tx.test( async(done: any) => {
            azureCosmosDbQuery.kind = "apps";
            this.sandbox.stub(Items.prototype, 'query').returns(queryIterator);
            let res = await this.cosmos.runQuery(azureCosmosDbQuery as IJournalQueryModel);
            Tx.checkTrue(res[1].endCursor === "continuationToken", done);
        });

        Tx.test( async(done: any) => {
            azureCosmosDbQuery.kind = "datasets";
            azureCosmosDbQuery.filters = [{property: "property", operator: "=", value: {value: "value"}}];
            AzureConfig.SIDECAR_ENABLE_QUERY = true;
            AzureConfig.SIDECAR_URL = "sidecar_URL";
            this.sandbox.stub(AzureDataEcosystemServices, "getCosmosConnectionParams").resolves({ endpoint: "endpoint", key: "key" });
            await this.cosmos.runQuery(azureCosmosDbQuery as IJournalQueryModel).then(res => {
                done();
            }).catch(err => {
                done();
                assert.fail(err)
            })
        });

        Tx.test( async(done: any) => {
            azureCosmosDbQuery.kind = "datasets";
            azureCosmosDbQuery.filters = [{property: "property", operator: "RegexMatch", value: {value: "value"}}];
            AzureConfig.SIDECAR_ENABLE_QUERY = false;
            this.sandbox.stub(Items.prototype, 'query').returns(queryIterator);
            let res = await this.cosmos.runQuery(azureCosmosDbQuery as IJournalQueryModel);
            Tx.checkTrue(res[1].endCursor === "continuationToken", done);
        });

        Tx.test( async(done: any) => {
            azureCosmosDbQuery.kind = "datasets";
            azureCosmosDbQuery.filters = [{property: "property", operator: "CONTAINS", value: {value: "value"}}];
            AzureConfig.SIDECAR_ENABLE_QUERY = false;
            azureCosmosDbQuery.pagingStart = '';
            azureCosmosDbQuery.pagingLimit = 0;
            this.sandbox.stub(Items.prototype, 'query').returns(queryIterator);
            let res = await this.cosmos.runQuery(azureCosmosDbQuery as IJournalQueryModel)
            Tx.checkTrue(res[1].endCursor === "continuationToken", done);
        });

    }

    private static createKey() {
        Tx.sectionInit('create key');

        Tx.test(async (done: any) => {
            const specs = {
                namespace: 'testNamespace',
                path: [AzureConfig.TENANTS_KIND, 'tnName']
            }

            const expectedKey = { partitionKey: 'tn-tnName', name: 'tnName' }

            const key = this.cosmos.createKey(specs);
            assert.deepEqual(key, expectedKey, 'Keys do not match');
            done();
        });

        Tx.test(async (done: any) => {
            const specs = {
                namespace: 'testNamespace',
                path: [AzureConfig.SUBPROJECTS_KIND, 'spName']
            }

            const expectedKey = { partitionKey: 'sp-spName', name: 'spName' }

            const key = this.cosmos.createKey(specs);
            assert.deepEqual(key, expectedKey, 'Keys do not match');
            done();
        });

        Tx.test(async (done: any) => {
            const specs = {
                namespace: Config.SEISMIC_STORE_NS + '-tenant-sp',
                path: [Config.DATASETS_KIND],
                enforcedKey: '/path/name'
            }
            const partitionKey = 'ds-tenant-sp-' + crypto.createHash('sha512').update('/path/name').digest('hex');
            const expectedKey = { partitionKey, name: 'name' }

            const key = this.cosmos.createKey(specs) as { name: string, partitionKey: string, kind: string };
            assert.deepEqual(key, expectedKey, 'Keys do not match');
            done();
        });

        Tx.test(async (done: any) => {
            const specs = {
                namespace: 'testNamespace',
                path: [AzureConfig.APPS_KIND, 'apName']
            }

            const expectedKey = { partitionKey: 'ap-apName', name: 'apName' }

            const key = this.cosmos.createKey(specs);
            assert.deepEqual(key, expectedKey, 'Keys do not match');
            done();
        });
    }

    private static getTransaction() {
        Tx.sectionInit('getTransaction');

        Tx.test( (done: any) => {
            let res = this.cosmos.getTransaction();
            Tx.checkTrue(res !== undefined, done);
        });

    }

    private static getQueryFilterSymbolContains() {
        Tx.sectionInit('getQueryFilterSymbolContains');

        Tx.test( (done: any) => {
            let res = this.cosmos.getQueryFilterSymbolContains();
            Tx.checkTrue(res === "CONTAINS", done);
        });

    }
}
