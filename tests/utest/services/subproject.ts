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

import { Datastore } from '@google-cloud/datastore';
import { Request as expRequest, Response as expResponse } from 'express';
import sinon from 'sinon';
import { Auth, AuthGroups } from '../../../src/auth';
import { Config, google, StorageFactory } from '../../../src/cloud';
import { IStorage } from '../../../src/cloud/storage';
import { DatasetDAO } from '../../../src/services/dataset';
import { SubProjectDAO, SubprojectGroups, SubProjectModel } from '../../../src/services/subproject';
import { SubProjectHandler } from '../../../src/services/subproject/handler';
import { SubProjectOP } from '../../../src/services/subproject/optype';
import { SubProjectParser } from '../../../src/services/subproject/parser';
import { TenantDAO, TenantModel } from '../../../src/services/tenant';
import { Response } from '../../../src/shared';
import { Tx } from '../utils';


export class TestSubProjectSVC {

    public static run() {
        this.testSubProject = {
            name: 'test-subproject',
            admin: 'test-admin@domain.com',
            tenant: 'test-tenant',
            storage_class: 'geo-location',
            acls: {
                admins: ['admin-a@domain.com'],
                viewers: ['vieweres-b@domain.com']
            },
            ltag: 'legalTag'
        } as SubProjectModel

        TestSubProjectSVC.testDb = new Datastore({ projectId: 'GPRJ' });
        // this.query = this.journal.createQuery('namespace', 'kind');

        describe(Tx.testInit('subproject'), () => {

            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
                this.journal = this.sandbox.createStubInstance(google.DatastoreDAO);
                this.journal.createQuery.callsFake(
                    (namespace, kind) => TestSubProjectSVC.testDb.createQuery(namespace, kind));
                this.journal.createKey.callsFake((specs) => TestSubProjectSVC.testDb.key(specs));
                this.journal.KEY = Datastore.KEY;
                this.sandbox.stub(Response, 'writeMetric').returns();
                // set CLOUD PROVIDER so that GCS class is loaded
                Config.CLOUDPROVIDER = 'google';
            });
            afterEach(() => { this.sandbox.restore(); });

            this.create();
            this.get();
            this.list();
            this.others();
            this.delete();

        });

    }

    private static sandbox: sinon.SinonSandbox;

    private static journal: any;
    private static testDb: Datastore;
    private static testSubProject: SubProjectModel
    // private static query: any;

    private static create() {

        Tx.sectionInit('create');

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.admin = 'user@user.com';
            expReq.body.storage_class = 'REGIONAL';
            expReq.body.storage_location = 'US-CENTRAL1';
            expReq.headers.ltag = 'ltag';
            this.sandbox.stub(TenantDAO, 'get').resolves({} as any);
            this.sandbox.stub(Auth, 'isUserAuthorized').resolves();
            this.sandbox.stub(Auth, 'isLegalTagValid').resolves();
            this.sandbox.stub(SubProjectDAO, 'exist').resolves(false);
            this.sandbox.stub(google.GCS.prototype, 'createBucket').resolves();
            this.sandbox.stub(SubProjectDAO, 'register').resolves();
            this.sandbox.stub(AuthGroups, 'createGroup').resolves();
            this.sandbox.stub(AuthGroups, 'listUsersInGroup').rejects({ error: { code: 404, status: 'NOT_FOUND' } });
            this.sandbox.stub(AuthGroups, 'addUserToGroup').resolves();
            this.sandbox.stub(google.GCS.prototype, 'bucketExists').resolves(false);
            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            await SubProjectHandler.handler(expReq, expRes, SubProjectOP.Create);
            Tx.check200(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.admin = 'user@user.com';
            expReq.body.storage_class = 'REGIONAL';
            expReq.body.storage_location = 'US-CENTRAL1';
            expReq.headers.ltag = 'ltag';
            this.sandbox.stub(TenantDAO, 'get').resolves({} as any);
            this.sandbox.stub(Auth, 'isUserAuthorized');
            this.sandbox.stub(Auth, 'isLegalTagValid');
            this.sandbox.stub(SubProjectDAO, 'exist').resolves({} as any);
            this.sandbox.stub(Response, 'writeError');
            await SubProjectHandler.handler(expReq, expRes, SubProjectOP.Create);
            done();
        });

        Tx.testExp(async (done: any) => {
            this.journal.save.resolves();
            const subproj = { tenant: 'tnx', name: 'spx' } as SubProjectModel;
            const spkey = this.journal.createKey({
                namespace: Config.SEISMIC_STORE_NS + '-' + subproj.tenant,
                path: [Config.SUBPROJECTS_KIND, subproj.name],
            });
            await SubProjectDAO.register(this.journal, { key: spkey, data: subproj });
            done();
        });

    }

    private static get() {

        Tx.sectionInit('get');

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            this.sandbox.stub(TenantDAO, 'get').resolves({} as any);
            this.sandbox.stub(Auth, 'isUserAuthorized');
            this.sandbox.stub(SubProjectDAO, 'get').resolves(this.testSubProject);
            this.sandbox.stub(Auth, 'isLegalTagValid')
            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            await SubProjectHandler.handler(expReq, expRes, SubProjectOP.Get);
            Tx.check200(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            this.sandbox.stub(TenantDAO, 'get').resolves({} as any);
            this.sandbox.stub(Auth, 'isUserAuthorized');
            this.sandbox.stub(Auth, 'isLegalTagValid')
            this.sandbox.stub(SubProjectDAO, 'get').resolves(this.testSubProject);
            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            await SubProjectHandler.handler(expReq, expRes, SubProjectOP.Get);
            Tx.check200(expRes.statusCode, done);
        });

        // Tx.testExp(async (done: any) => {
        //     this.journal.get.resolves([{}] as never);
        //     this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
        //     this.sandbox.stub(Auth, 'isLegalTagValid')
        //     const spkey = this.journal.createKey({
        //         namespace: Config.SEISMIC_STORE_NS + '-' + 'tnx',
        //         path: [Config.SUBPROJECTS_KIND, 'spx'],
        //     });
        //     await SubProjectDAO.get(this.journal, 'tnx', 'spx', spkey);
        //     done();
        // });

        // Tx.testExp(async (done: any) => {
        //     this.journal.get.resolves([{ name: 'name', tenant: 'tenant' }] as never);
        //     this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
        //     this.sandbox.stub(Auth, 'isLegalTagValid')
        //     const spkey = this.journal.createKey({
        //         namespace: Config.SEISMIC_STORE_NS + '-' + 'tnx',
        //         path: [Config.SUBPROJECTS_KIND, 'spx'],
        //     });
        //     await SubProjectDAO.get(this.journal, 'tnx', 'spx', spkey);
        //     done();
        // });

        Tx.testExp(async (done: any) => {
            this.journal.get.resolves([] as never);
            try {
                const spkey = this.journal.createKey({
                    namespace: Config.SEISMIC_STORE_NS + '-' + 'tnx',
                    path: [Config.SUBPROJECTS_KIND, 'spx'],
                });
                await SubProjectDAO.get(this.journal, 'tnx', 'spx', spkey);
            } catch (e) { Tx.check404(e.error.code, done); }
        });

    }

    private static list() {

        Tx.sectionInit('list');

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            this.sandbox.stub(TenantDAO, 'get').resolves({} as any);
            this.sandbox.stub(Auth, 'isUserAuthorized');
            this.sandbox.stub(SubProjectDAO, 'list').resolves([{ ltag: 'ltag' }, {}] as any);
            this.sandbox.stub(Auth, 'isLegalTagValid');
            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            await SubProjectHandler.handler(expReq, expRes, SubProjectOP.List);
            Tx.check200(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            this.sandbox.stub(TenantDAO, 'get').resolves({} as any);
            this.sandbox.stub(Auth, 'isUserAuthorized');
            this.sandbox.stub(SubProjectDAO, 'list').resolves([{ ltag: 'ltag' }, {}] as any);
            this.sandbox.stub(Auth, 'isLegalTagValid').resolves({} as any);
            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            await SubProjectHandler.handler(expReq, expRes, SubProjectOP.List);
            Tx.check200(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any) => {
            // this.sandbox.stub(Datastore.prototype, 'createQuery').returns(this.query);
            this.journal.runQuery.resolves([[]] as never);
            await SubProjectDAO.list(this.journal, 'tnx');
            done();
        });

        Tx.testExp(async (done: any) => {
            const entityID = []; entityID[this.journal.KEY] = { name: 'name' };
            // this.sandbox.stub(Datastore.prototype, 'createQuery').returns(this.query);
            this.journal.runQuery.resolves([[entityID]] as never);
            await SubProjectDAO.list(this.journal, 'tnx');
            done();
        });

        Tx.testExp(async (done: any) => {
            const entityID = []; entityID[this.journal.KEY] = { name: 'name' };
            // this.sandbox.stub(Datastore.prototype, 'createQuery').returns(this.query);
            this.journal.runQuery.resolves([[{ name: 'name', tenant: 'tenant' }]] as never);
            await SubProjectDAO.list(this.journal, 'tnx');
            done();
        });
    }

    private static others() {

        Tx.sectionInit('others');

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            this.sandbox.stub(Auth, 'isImpersonationToken').returns(true);
            this.sandbox.stub(Auth, 'isLegalTagValid')
            await SubProjectHandler.handler(expReq, expRes, SubProjectOP.Create);
            Tx.check403(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            this.sandbox.stub(TenantDAO, 'get').resolves({} as any);
            await SubProjectHandler.handler(expReq, expRes, undefined);
            done();
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.admin = 'user@user.com';
            expReq.body.storage_class = 'REGIONAL';
            expReq.body.storage_location = 'US-CENTRAL1';
            expReq.headers.ltag = 'ltag';
            expReq.params.subprojectid = 's';
            this.sandbox.stub(TenantDAO, 'get').resolves({} as any);
            try {
                SubProjectParser.create(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.admin = 'user@user.com';
            expReq.body.storage_class = 'XXX';
            expReq.body.storage_location = 'US-CENTRAL1';
            expReq.headers.ltag = 'ltag';
            this.sandbox.stub(TenantDAO, 'get').resolves({} as any);
            try {
                SubProjectParser.create(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.admin = 'user@user.com';
            expReq.body.storage_class = 'REGIONAL';
            expReq.body.storage_location = 'XXX';
            expReq.headers.ltag = 'ltag';
            this.sandbox.stub(TenantDAO, 'get').resolves({} as any);
            try {
                SubProjectParser.create(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.admin = 'user@user.com';
            expReq.body.storage_class = 'MULTI_REGIONAL';
            expReq.body.storage_location = 'US-CENTRAL1';
            expReq.headers.ltag = 'ltag';
            this.sandbox.stub(TenantDAO, 'get').resolves({} as any);
            try {
                SubProjectParser.create(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.admin = 'user@user.com';
            expReq.body.storage_class = 'REGIONAL';
            expReq.body.storage_location = 'EU';
            expReq.headers.ltag = 'ltag';
            this.sandbox.stub(TenantDAO, 'get').resolves({} as any);
            try {
                SubProjectParser.create(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.testExp(async (done: any) => {
            process.env.GCLOUD_PROJECT = 'ON';
            this.journal.get.resolves([] as never);
            const spkey = this.journal.createKey({
                namespace: Config.SEISMIC_STORE_NS + '-' + 'tnx',
                path: [Config.SUBPROJECTS_KIND, 'spx'],
            });
            await SubProjectDAO.exist(this.journal, spkey);
            delete process.env.GCLOUD_PROJECT;
            done();
        });

    }
    private static delete() {

        Tx.sectionInit('delete');

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            this.sandbox.stub(TenantDAO, 'get').resolves({ name: 'tenant-a', gcpid: 'gcp-id' } as TenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(this.testSubProject);
            Config.CLOUDPROVIDER = 'google';
            this.sandbox.stub(SubProjectDAO, 'delete').resolves();
            this.sandbox.stub(DatasetDAO, 'deleteAll').resolves();
            this.sandbox.stub(Auth, 'isUserAuthorized').resolves();
            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            const storage: IStorage = {
                async deleteFiles() {
                    await new Promise(resolve => setTimeout(resolve, 1));
                },
                async deleteBucket() {
                    await new Promise(resolve => setTimeout(resolve, 1));
                },
                async createBucket() { return; },
                async bucketExists() { return false; },
                async deleteObject() { return; },
                async deleteObjects() { return; },
                async saveObject() { return; },
                async copy() { return; },
                randomBucketName() { return ''; }
            };
            this.sandbox.stub(StorageFactory, 'build').returns(storage);
            this.sandbox.stub(SubprojectGroups, 'adminGroup').returns('admingroup');
            this.sandbox.stub(SubprojectGroups, 'editorGroup').returns('editorgroup');
            this.sandbox.stub(SubprojectGroups, 'viewerGroup').returns('viewergroup');
            this.sandbox.stub(AuthGroups, 'clearGroup').resolves();

            await SubProjectHandler.handler(expReq, expRes, SubProjectOP.Delete);
            Tx.check200(expRes.statusCode, done);

        });

    }

}
