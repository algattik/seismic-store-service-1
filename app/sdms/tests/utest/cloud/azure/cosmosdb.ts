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

import { Container, Item, Items } from '@azure/cosmos';
import { AzureCosmosDbDAO } from '../../../../src/cloud/providers/azure/cosmosdb';
import { Config } from '../../../../src/cloud';
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
            this.cosmos = new AzureCosmosDbDAO({ gcpid: 'gcpid', default_acls:'x', esd: 'gcpid@domain.com', name: 'gcpid'});

            beforeEach(()=> {
                this.sandbox.stub(AzureCosmosDbDAO.prototype, 'getCosmoContainer').resolves(
                    new Container(undefined, 'id', undefined) );
            })

            afterEach(() => {
                this.sandbox.restore();
            });

            this.save();
            this.get();
            this.delete();
            this.createKey();
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
                resource: undefined
            } as any;

            this.sandbox.stub(Item.prototype, 'read').returns(Promise.resolve(mockResult));
            const [res] = await this.cosmos.get(key);
            Tx.checkTrue(res === undefined, done);
        });

    }

    private static delete() {
        Tx.sectionInit('delete');

        Tx.test(async (done: any) => {
            this.sandbox.stub(Item.prototype, 'delete').resolves();
            await this.cosmos.delete('entity');
            done();
        });
    }

    private static createKey() {
        Tx.sectionInit('create key');

        Tx.test(async (done: any) => {
            const specs = {
                namespace: 'testNamespace',
                path: [AzureConfig.SUBPROJECTS_KIND, 'spName']
            }

            const expectedKey = { partitionKey: 'sp-spName' }

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
            const expectedKey = { partitionKey }

            const key = this.cosmos.createKey(specs) as { name: string, partitionKey: string, kind: string };
            assert.deepEqual(key, expectedKey, 'Keys do not match');
            done();
        });
    }
}
