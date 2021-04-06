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

import { Request as expRequest, Response as expResponse } from 'express';
import sinon from 'sinon';
import { Auth, AuthGroups } from '../../../src/auth';
import { JournalFactoryTenantClient } from '../../../src/cloud';
import { Config } from '../../../src/cloud/config';
import { google } from '../../../src/cloud/providers';
import { SubProjectDAO, SubprojectGroups, SubProjectModel } from '../../../src/services/subproject';
import { TenantDAO } from '../../../src/services/tenant';
import { UserHandler } from '../../../src/services/user/handler';
import { UserOP } from '../../../src/services/user/optype';
import { UserParser } from '../../../src/services/user/parser';
import { Response, SDPathModel } from '../../../src/shared';
import { Tx } from '../utils';



export class TestUserSVC {

    public static run() {

        describe(Tx.testInit('user'), () => {

            beforeEach(() => {
                this.spy = sinon.createSandbox();
                this.spy.stub(Response, 'writeMetric').returns();
                this.subproject = {
                    name: 'subproject-test',
                    admin: 'admin@xyz.com',
                    acls: {
                        admins: [],
                        viewers: []
                    }
                } as SubProjectModel

                this.journal = this.spy.createStubInstance(google.DatastoreDAO);
                Config.CLOUDPROVIDER = 'google';
            });
            afterEach(() => { this.spy.restore(); });

            this.add();
            this.remove();
            this.list();
            this.roles();
            this.others();

        });

    }

    private static spy: sinon.SinonSandbox;
    private static subproject: SubProjectModel;
    private static journal: any;

    private static add() {

        Tx.sectionInit('add');

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.email = 'user@user.com';
            expReq.body.path = 'sd://tnx/spx';
            expReq.body.group = 'editor';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(AuthGroups, 'addUserToGroup');
            this.spy.stub(UserHandler, 'doNotThrowIfNotMember' as never).resolves();
            this.spy.stub(JournalFactoryTenantClient, 'get').returns(this.journal)
            this.spy.stub(SubProjectDAO, 'get').resolves(this.subproject)
            await UserHandler.handler(expReq, expRes, UserOP.Add);
            Tx.check200(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.email = 'user@user.com';
            expReq.body.path = 'sd://tnx/spx';
            expReq.body.group = 'viewer';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(AuthGroups, 'addUserToGroup');
            this.spy.stub(UserHandler, 'doNotThrowIfNotMember' as never).resolves();
            this.spy.stub(JournalFactoryTenantClient, 'get').returns(this.journal)
            this.spy.stub(SubProjectDAO, 'get').resolves(this.subproject)
            await UserHandler.handler(expReq, expRes, UserOP.Add);
            Tx.check200(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.email = 'user@user.com';
            expReq.body.path = 'sd://tnx/spx';
            expReq.body.group = 'admin';
            this.spy.stub(AuthGroups, 'removeUserFromGroup').resolves();
            this.spy.stub(AuthGroups, 'addUserToGroup');
            this.spy.stub(UserHandler, 'doNotThrowIfNotMember' as never).resolves();
            this.spy.stub(TenantDAO, 'get').resolves({ name: 'tenant-a', esd: 'esd', gcpid: 'gcpid' } as any);
            this.spy.stub(JournalFactoryTenantClient, 'get').returns(this.journal)
            this.spy.stub(SubProjectDAO, 'get').resolves(this.subproject)
            await UserHandler.handler(expReq, expRes, UserOP.Add);
            Tx.check200(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.email = 'user@user.com';
            expReq.body.path = 'sd://tnx';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(JournalFactoryTenantClient, 'get').returns(this.journal)
            this.spy.stub(SubProjectDAO, 'get').resolves(this.subproject)
            await UserHandler.handler(expReq, expRes, UserOP.Add);
            Tx.check400(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            this.spy.stub(UserParser, 'addUser').returns(
                { email: '', sdPath: { tenant: 'tnx01', subproject: 'spx' } as SDPathModel, groupRole: 'none' });
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(Response, 'writeError');
            this.spy.stub(SubProjectDAO, 'get').resolves(this.subproject)
            this.spy.stub(JournalFactoryTenantClient, 'get').returns(this.journal)
            await UserHandler.handler(expReq, expRes, UserOP.Add);
            done();
        });

        Tx.testExp(async (done: any, expReq: expRequest) => {
            expReq.body.email = 'user@user.com';
            expReq.body.path = 'wrong';
            try {
                UserParser.addUser(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.testExp(async (done: any, expReq: expRequest) => {
            expReq.body.email = 'user@user.com';
            expReq.body.path = 'sd://';
            try {
                UserParser.addUser(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.testExp(async (done: any, expReq: expRequest) => {
            expReq.body.email = 'user@user.com';
            expReq.body.path = 'sd://tnx/spx';
            expReq.body.group = 'wrong';
            try {
                UserParser.addUser(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

    }

    private static remove() {

        Tx.sectionInit('remove');

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.email = 'user2@user.com';
            expReq.body.path = 'sd://tnx/spx';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(JournalFactoryTenantClient, 'get').returns(this.journal)
            this.spy.stub(AuthGroups, 'removeUserFromGroup');
            this.subproject.acls.admins = ["group1", "group2"]
            this.subproject.acls.viewers = ["vgroup1", "vgroup2"]
            this.spy.stub(SubProjectDAO, 'get').resolves(this.subproject)
            await UserHandler.handler(expReq, expRes, UserOP.Remove);
            Tx.check200(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.email = 'user2@user.com';
            expReq.body.path = 'sd://tnx';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(JournalFactoryTenantClient, 'get').returns(this.journal)
            this.spy.stub(SubProjectDAO, 'get').resolves(this.subproject)
            await UserHandler.handler(expReq, expRes, UserOP.Remove);
            Tx.check400(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.email = 'user@user.com';
            expReq.body.path = 'sd://tnx/spx';
            this.spy.stub(Response, 'writeError');
            this.spy.stub(JournalFactoryTenantClient, 'get').returns(this.journal)
            this.spy.stub(SubProjectDAO, 'get').resolves(this.subproject)
            await UserHandler.handler(expReq, expRes, UserOP.Remove);
            done();
        });

        Tx.testExp(async (done: any, expReq: expRequest) => {
            expReq.body.email = 'user@user.com';
            expReq.body.path = 'wrong';
            try {
                UserParser.removeUser(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.testExp(async (done: any, expReq: expRequest) => {
            expReq.body.email = 'user@user.com';
            expReq.body.path = 'sd://';
            try {
                UserParser.removeUser(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

    }

    private static list() {

        Tx.sectionInit('list');

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.query.sdpath = 'sd://tnx/spx';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(Auth, 'isUserAuthorized');
            this.spy.stub(AuthGroups, 'listUsersInGroup').resolves([{ email: 'userx' }] as never);
            this.spy.stub(SubProjectDAO, 'get').resolves(this.subproject)
            await UserHandler.handler(expReq, expRes, UserOP.List);
            Tx.check200(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any, expReq: expRequest) => {
            expReq.query.sdpath = 'wrong';
            try {
                UserParser.listUsers(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.testExp(async (done: any, expReq: expRequest) => {
            expReq.query.sdpath = 'sd://tnx';
            try {
                UserParser.listUsers(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

    }

    private static roles() {

        Tx.sectionInit('roles');

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.query.sdpath = 'sd://tnx/spx';
            const prefix = SubprojectGroups.serviceGroupPrefix('tnx', 'spx');
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(AuthGroups, 'getUserGroups').resolves([{ name: prefix + '.abc' }] as any);
            this.spy.stub(SubProjectDAO, 'list').resolves([{ name: 'spx' } as SubProjectModel] as any)
            await UserHandler.handler(expReq, expRes, UserOP.Roles);
            Tx.check200(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.query.sdpath = 'sd://tnx/spx';
            const prefix = SubprojectGroups.serviceGroupPrefix('tnx', 'spx');
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(AuthGroups, 'getUserGroups').resolves([{ name: prefix + '.abc.abc' }] as any);
            this.spy.stub(SubProjectDAO, 'list').resolves([{ name: 'spx' } as SubProjectModel] as any)
            await UserHandler.handler(expReq, expRes, UserOP.Roles);
            Tx.check200(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.query.sdpath = 'sd://tnx';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(AuthGroups, 'getUserGroups').resolves([] as any);
            this.spy.stub(SubProjectDAO, 'list').resolves([{ name: 'spx' } as SubProjectModel] as any)
            await UserHandler.handler(expReq, expRes, UserOP.Roles);
            Tx.check200(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any, expReq: expRequest) => {
            expReq.query.sdpath = 'wrong';
            try {
                UserParser.rolesUser(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.testExp(async (done: any, expReq: expRequest) => {
            expReq.query.sdpath = 'sd://';
            try {
                UserParser.rolesUser(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

    }

    private static others() {

        Tx.sectionInit('others');

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            this.spy.stub(Auth, 'isImpersonationToken').returns(true);
            await UserHandler.handler(expReq, expRes, UserOP.Add);
            Tx.check403(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            await UserHandler.handler(expReq, expRes, undefined);
            done();
        });

    }

}
