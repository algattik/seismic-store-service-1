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

import request from 'request-promise';
import sinon from 'sinon';
import { Config } from '../../../src/cloud';
import { google } from '../../../src/cloud/providers';
import { DESEntitlement } from '../../../src/dataecosystem';
import { RecordLatency } from '../../../src/metrics/metrics';
import { Error } from '../../../src/shared/error';
import { Tx } from '../utils';


export class TestDESEntitlement {

   public static run() {

      describe(Tx.testInit('dataecosystem entitlements'), () => {

         beforeEach(() => {
            this.sandbox = sinon.createSandbox();
            this.sandbox.stub(RecordLatency.prototype, 'record').resolves();
            this.sandbox.stub(google.Credentials.prototype, 'getServiceCredentials').resolves('token');

         });
         afterEach(() => { this.sandbox.restore(); });

         this.getUsersGroups();
         this.addUserToGroup();
         this.removeUserFromGroup();
         this.createGroup();
         this.getGroupMembers();

      });

   }

   private static sandbox: sinon.SinonSandbox;

   private static getUsersGroups() {

      Tx.sectionInit('get users groups');

      Tx.test(async (done: any) => {

         const requestStub = this.sandbox.stub(request, 'get');
         requestStub.resolves(JSON.stringify({ groups: ['group1,', 'group2'] }));

         await DESEntitlement.getUserGroups('usertoken', 'tenant-one','appkey');

         const options = {
            headers: {
               'Accept': 'application/json',
               'AppKey': 'appkey',
               'Authorization': 'Bearer usertoken',
               'Content-Type': 'application/json',
               'slb-data-partition-id': 'tenant-one',
            },
            url: Config.DES_SERVICE_HOST_ENTITLEMENT + '/entitlements/v2/groups',
         };
         Tx.checkTrue(requestStub.calledWith(options), done);
      });

      Tx.test(async (done: any) => {
         const requestStub = this.sandbox.stub(request, 'get');
         requestStub.throws(Error.make(500, 'Error', 'mprefix'));
         try {
            await DESEntitlement.getUserGroups('usertoken', 'tenant-one', 'appkey');
         } catch (e) {
            Tx.check500(500, done);
         }

      });
   }

   private static addUserToGroup() {

      Tx.sectionInit('add user to group');

      Tx.test(async (done: any) => {
         const requestStub = this.sandbox.stub(request, 'post');
         requestStub.resolves();
         await DESEntitlement.addUserToGroup('usertoken', 'group-a', 'tenant-a', 'user@email', 'role-a','appkey');

         const options = {
            headers: {
               'Accept': 'application/json',
               'AppKey': 'appkey',
               'Authorization': 'Bearer usertoken',
               'Content-Type': 'application/json',
               'slb-data-partition-id': 'tenant-a',
            },
            json: {
               email: 'user@email',
               role: 'role-a',
            },
            url: Config.DES_SERVICE_HOST_ENTITLEMENT + '/entitlements/v2/groups/' + 'group-a' + '/members',
         };

         Tx.checkTrue(requestStub.calledWith(options), done);

      });

      Tx.test(async (done: any) => {
         this.sandbox.stub(request, 'post').throws();
         try {
            await DESEntitlement.addUserToGroup('usertoken', 'group-a', 'tenant-a', 'user@email', 'role-a', 'appkey');
         } catch (e) {
            Tx.check500(500, done);
         }
      });
   }

   private static removeUserFromGroup() {
      Tx.sectionInit('remove user from group');

      Tx.test(async (done: any) => {
         const requestStub = this.sandbox.stub(request, 'delete');
         requestStub.resolves();

         await DESEntitlement.removeUserFromGroup('usertoken', 'group-a', 'tenant-a', 'user@email', 'appkey');

         const options = {
            headers: {
               'Accept': 'application/json',
               'AppKey': 'appkey',
               'Authorization': 'Bearer usertoken',
               'Content-Type': 'application/json',
               'slb-data-partition-id': 'tenant-a',
            },
            url: Config.DES_SERVICE_HOST_ENTITLEMENT + '/entitlements/v2/groups/' + 'group-a' + '/members/' + 'user@email',
         };

         Tx.checkTrue(requestStub.calledWith(options), done);
      });

      Tx.test(async (done: any) => {
         this.sandbox.stub(request, 'delete').throws();
         try {
            await DESEntitlement.removeUserFromGroup('usertoken', 'group-a', 'tenant-a', 'user@email', 'appkey');
         } catch (e) {
            Tx.check500(500, done);
         }
      });
   }

   private static createGroup() {
      Tx.sectionInit('create group');

      Tx.test(async (done: any) => {
         const requestStub = this.sandbox.stub(request, 'post');
         requestStub.resolves();

         await DESEntitlement.createGroup('usertoken', 'group-a', 'group desc', 'tenant-a','appkey');

         const options = {
            headers: {
               'Accept': 'application/json',
               'AppKey':'appkey',
               'Authorization': 'Bearer usertoken',
               'Content-Type': 'application/json',
               'slb-data-partition-id': 'tenant-a',
            },
            json: {
               description: 'group desc',
               name: 'group-a',
            },
            url: Config.DES_SERVICE_HOST_ENTITLEMENT + '/entitlements/v2/groups',
         };

         Tx.checkTrue(requestStub.calledWith(options), done);

      });

      Tx.test(async (done: any) => {
         const requestStub = this.sandbox.stub(request, 'post');
         requestStub.throws();

         try {
            await DESEntitlement.createGroup('usertoken', 'group-a', 'group-desc', 'tenant-a','appkey');
         } catch (e) {
            Tx.check500(500, done);
         }

      });
   }

   private static getGroupMembers() {
      Tx.sectionInit('get group members');

      Tx.test(async (done: any) => {
         const requestStub = this.sandbox.stub(request, 'get');
         requestStub.resolves(JSON.stringify(
            {
               cursor: 'cursor',
               members: [{
                  email: 'member1@email',
                  role: 'role1',
               },
               {
                  email: 'member2@email',
                  role: 'role2',
               },

               ],
            },
         ));

         const results = await DESEntitlement.listUsersInGroup('userToken', 'group-a', 'tenant-a', undefined);
         Tx.checkTrue(results.members.length === 2 && results.nextCursor === 'cursor', done);

      });

      Tx.test(async (done: any) => {
         const requestStub = this.sandbox.stub(request, 'get');
         requestStub.throws();
         try {
            await DESEntitlement.listUsersInGroup('userToken', 'group-a', 'tenant-a', undefined);
         } catch (e) {
            Tx.check500(500, done);
         }
      });
   }
}
