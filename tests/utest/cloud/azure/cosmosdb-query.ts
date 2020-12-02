import sinon from 'sinon';

import { Item, Items, SqlParameter } from '@azure/cosmos';
import { AzureCosmosDbQuery, AzureCosmosDbDAO } from '../../../../src/cloud/providers/azure/cosmosdb';
import { Config } from '../../../../src/cloud';
import { Tx } from '../../utils';
import { assert } from 'chai';

export class TestAzureCosmosDbQuery {
    private static sandbox: sinon.SinonSandbox;
    private static cosmos: AzureCosmosDbDAO;

    public static run() {

        describe(Tx.testInit('azure cosmos db query tests'), () => {
            Config.CLOUDPROVIDER = 'azure';
            this.sandbox = sinon.createSandbox();
            this.cosmos = new AzureCosmosDbDAO({ gcpid: 'gcpid', default_acls:'x', esd: 'gcpid@domain.com', name: 'gcpid'});

            afterEach(() => {
                this.sandbox.restore();
            });

            this.filterNone();
            this.filterSingle();
            this.filterMultiple();
            this.filterSameFieldMultipleCriteria();
            this.filterOverloading();
            this.filterHasAncestor();
            this.queryProjectionSingle();
            this.queryProjectionMultiple();
            this.queryGroupBySingle();
            this.queryGroupByMultiple();
            this.querySelectAndGroupByMultiple();
            this.pagingScenariosTokenContinuation();
            this.pagingScenariosBufferContinuation();
            this.pagingScenariosPageLimit();
            this.pagingScenariosTokenContinuationAndPageLimit();
        });
    }

    private static filterNone() {
        Tx.sectionInit('filterNone');
        Tx.test((done: any) => {
            // setup
            const subject = new AzureCosmosDbQuery('ns', Config.DATASETS_KIND);
            // act
            const actual = subject.prepareSqlStatement('foo').spec;
            // assert
            assert.equal(actual.query, 'SELECT * FROM foo AS a');
            done();
        });
    }

    private static filterSingle() {
        Tx.sectionInit('filterSingle');
        Tx.test((done: any) => {
            // setup
            const subject = new AzureCosmosDbQuery('ns', Config.DATASETS_KIND);
            subject.filter('fieldA', '=', 'test value');
            // act
            const actual = subject.prepareSqlStatement('foo').spec;
            // assert
            assert.equal(actual.query, 'SELECT * FROM foo AS a WHERE a.data.fieldA = @fieldA');
            assert.equal(actual.parameters.length, 1);
            assert.equal(actual.parameters[0].name, '@fieldA');
            assert.equal(actual.parameters[0].value, 'test value');
            done();
        });
    }

    private static filterMultiple() {
        Tx.sectionInit('filterMultiple');
        Tx.test((done: any) => {
            // setup
            const subject = new AzureCosmosDbQuery('ns', Config.DATASETS_KIND);
            subject.filter('fieldA', '<=', 'test value 1');
            subject.filter('fieldB', '>=', 'test value 2');
            // act
            const actual = subject.prepareSqlStatement('foo').spec;
            // assert
            assert.equal(actual.query, 'SELECT * FROM foo AS a WHERE a.data.fieldA <= @fieldA AND a.data.fieldB >= @fieldB');
            assert.equal(actual.parameters.length, 2);
            assert.equal(actual.parameters[0].name, '@fieldA');
            assert.equal(actual.parameters[0].value, 'test value 1');
            assert.equal(actual.parameters[1].name, '@fieldB');
            assert.equal(actual.parameters[1].value, 'test value 2');
            done();
        });
    }

    private static filterSameFieldMultipleCriteria() {
        Tx.sectionInit('filterSameFieldMultipleCriteria');
        Tx.test((done: any) => {
            // setup
            const subject = new AzureCosmosDbQuery('ns', Config.DATASETS_KIND);
            subject.filter('fieldA', '<=', 'test value 1');
            subject.filter('fieldB', '>=', 0);
            subject.filter('fieldB', '<=', 3);
            // act
            const actual = subject.prepareSqlStatement('foo').spec;
            // assert
            assert.equal(actual.query, 'SELECT * FROM foo AS a WHERE a.data.fieldA <= @fieldA AND a.data.fieldB >= @fieldB AND a.data.fieldB <= @fieldB1');
            assert.equal(actual.parameters.length, 3);
            assert.deepEqual(actual.parameters[0], { name: '@fieldA', value: 'test value 1' });
            assert.deepEqual(actual.parameters[1], { name: '@fieldB', value: 0 });
            assert.deepEqual(actual.parameters[2], { name: '@fieldB1', value: 3 });
            done();
        });
    }

    private static filterOverloading() {
        Tx.sectionInit('filterOverloading');
        Tx.test((done: any) => {
            // setup
            const subject = new AzureCosmosDbQuery('ns', Config.DATASETS_KIND);
            subject.filter('fieldA', 'test value 1');
            subject.filter('fieldB', '>=', 'test value 2');
            // act
            const actual = subject.prepareSqlStatement('foo').spec;
            // assert
            assert.equal(actual.query, 'SELECT * FROM foo AS a WHERE a.data.fieldA = @fieldA AND a.data.fieldB >= @fieldB');
            assert.equal(actual.parameters.length, 2);
            assert.equal(actual.parameters[0].name, '@fieldA');
            assert.equal(actual.parameters[0].value, 'test value 1');
            assert.equal(actual.parameters[1].name, '@fieldB');
            assert.equal(actual.parameters[1].value, 'test value 2');
            done();
        });
    }

    private static filterHasAncestor() {
        Tx.sectionInit('filterHasAncestor');
        Tx.test((done: any) => {
            // setup
            const subject = new AzureCosmosDbQuery('ns', Config.DATASETS_KIND);
            subject.filter('fieldA', 'HAS_ANCESTOR', 'value doesn\'t matter');
            // act
            try {
                const actual = subject.prepareSqlStatement('foo').spec;
            }
            catch (err) {
                assert.equal(err.message, 'HAS_ANCESTOR operator is not supported in query filters.');
                done();
                return;
            }
            // failure expected for this test case
            assert.fail(new Error('HAS_ANCESTOR operation shouldn\'t be processed for CosmosDB queries.'));
        });
    }

    private static queryProjectionSingle() {
        Tx.sectionInit('queryProjectionSingle');
        Tx.test((done: any) => {
            // setup
            const subject = new AzureCosmosDbQuery('ns', Config.DATASETS_KIND);
            subject.select('fieldA');
            // act
            const actual = subject.prepareSqlStatement('foo').spec;
            // assert
            assert.equal(actual.query, 'SELECT a.data.fieldA FROM foo AS a');
            done();
        });
    }

    private static queryProjectionMultiple() {
        Tx.sectionInit('queryProjectionMultiple');
        Tx.test((done: any) => {
            // setup
            const subject = new AzureCosmosDbQuery('ns', Config.DATASETS_KIND);
            subject.select([ 'fieldA', 'fieldB' ]);
            // act
            const actual = subject.prepareSqlStatement('foo').spec;
            // assert
            assert.equal(actual.query, 'SELECT a.data.fieldA, a.data.fieldB FROM foo AS a');
            done();
        });
    }

    private static queryGroupBySingle() {
        Tx.sectionInit('queryGroupBySingle');
        Tx.test((done: any) => {
            // setup
            const subject = new AzureCosmosDbQuery('ns', Config.DATASETS_KIND);
            subject.groupBy('fieldA');
            // act
            const actual = subject.prepareSqlStatement('foo').spec;
            // assert
            assert.equal(actual.query, 'SELECT * FROM foo AS a GROUP BY a.data.fieldA');
            done();
        });
    }

    private static queryGroupByMultiple() {
        Tx.sectionInit('queryGroupByMultiple');
        Tx.test((done: any) => {
            // setup
            const subject = new AzureCosmosDbQuery('ns', Config.DATASETS_KIND);
            subject.groupBy([ 'fieldA', 'fieldB' ]);
            // act
            const actual = subject.prepareSqlStatement('foo').spec;
            // assert
            assert.equal(actual.query, 'SELECT * FROM foo AS a GROUP BY a.data.fieldA, a.data.fieldB');
            done();
        });
    }

    private static querySelectAndGroupByMultiple() {
        Tx.sectionInit('querySelectAndGroupByMultiple');
        Tx.test((done: any) => {
            // setup
            const subject = new AzureCosmosDbQuery('ns', Config.DATASETS_KIND);
            subject.select([ 'fieldA', 'fieldB' ]);
            subject.groupBy([ 'fieldA', 'fieldB' ]);
            // act
            const actual = subject.prepareSqlStatement('foo').spec;
            // assert
            assert.equal(actual.query, 'SELECT a.data.fieldA, a.data.fieldB FROM foo AS a GROUP BY a.data.fieldA, a.data.fieldB');
            done();
        });
    }

    private static pagingScenariosTokenContinuation() {
        Tx.sectionInit('pagingScenarios - token continuation');

        Tx.test((done: any) => {
            try {
                // setup
                const query = this.cosmos.createQuery('ns', Config.DATASETS_KIND);
                query.start('token');
                // act
                const actual = (query as AzureCosmosDbQuery).prepareSqlStatement('foo');
                // assert
                assert.deepEqual(actual, {
                    spec: {
                        query: 'SELECT * FROM foo AS c'
                    },
                    options: {
                        continuationToken: 'token'
                    }});
            }
            finally {
                done();
            }
        });
    }

    private static pagingScenariosBufferContinuation() {
        Tx.sectionInit('pagingScenarios - buffer continuation');

        Tx.test((done: any) => {
            // setup
            const query = this.cosmos.createQuery('ns', Config.DATASETS_KIND);
            // act
            try {
                query.start(Buffer.from('data'));
                // failure expected for this test case
                assert.fail(new Error('runQuery() operation should fail for CosmosDB queries if a Buffer is used for pagination continuation.'));
            }
            catch (err) {
                assert.equal(err.message, 'Type \'Buffer\' is not supported for CosmosDB Continuation while paging.');
            }
            done();
        });
    }

    private static pagingScenariosPageLimit() {
        Tx.sectionInit('pagingScenarios - page limit');

        Tx.test((done: any) => {
            try {
                // setup
                const query = this.cosmos.createQuery('ns', Config.DATASETS_KIND);
                query.limit(5);
                // act
                const actual = (query as AzureCosmosDbQuery).prepareSqlStatement('foo');
                // assert
                assert.deepEqual(actual, {
                    spec: {
                        query: 'SELECT * FROM foo AS c'
                    },
                    options: {
                        maxItemCount: 5
                    }});
            }
            finally {
                done();
            }
        });
    }

    private static pagingScenariosTokenContinuationAndPageLimit() {
        Tx.sectionInit('pagingScenarios - token continuation and page limit');

        Tx.test((done: any) => {
            try {
                // setup
                const query = this.cosmos.createQuery('ns', Config.DATASETS_KIND);
                query.start('token');
                query.limit(5);
                // act
                const actual = (query as AzureCosmosDbQuery).prepareSqlStatement('foo');
                // assert
                assert.deepEqual(actual, {
                    spec: {
                        query: 'SELECT * FROM foo AS c'
                    },
                    options: {
                        continuationToken: 'token',
                        maxItemCount: 5
                    }});
            }
            finally {
                done();
            }
        });
    }
}
