import sinon from 'sinon';

import { Container, Item, Items } from '@azure/cosmos';
import { AzureCosmosDbDAO } from '../../../../src/cloud/providers/azure/cosmosdb';
import { Config } from '../../../../src/cloud';
import { Tx } from '../../utils';
import { assert } from 'chai';

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
            this.cosmos.delete('entity');
            done();
        });
    }

    private static createKey() {
        Tx.sectionInit('create key');

        Tx.test(async (done: any) => {
            const specs = {
                namespace: 'testNamespace',
                path: ['testKind', 'testPathValue']
            }

            const expectedKey = {
                name: specs.path[1],
                partitionKey: specs.namespace + '-' + specs.path[0],
                kind: specs.path[0]
            }

            const key = this.cosmos.createKey(specs);
            assert.deepEqual(key, expectedKey, 'Keys do not match');
            done();
        });

        Tx.test(async (done: any) => {
            const specs = {
                namespace: 'testNamespace',
                path: [Config.DATASETS_KIND]
            }

            const expectedKey = {
                name: undefined,
                partitionKey: specs.namespace + '-' + specs.path[0],
                kind: Config.DATASETS_KIND
            }

            const key = this.cosmos.createKey(specs) as { name: string, partitionKey: string, kind: string };
            assert.deepEqual(key.partitionKey, expectedKey.partitionKey);
            assert.deepEqual(key.kind, expectedKey.kind);
            assert.isDefined(key.name);
            assert.equal(key.name.length, 16);
            done();
        });
    }
}
