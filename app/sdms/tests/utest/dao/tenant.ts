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

import sinon from 'sinon';

import { Datastore } from '@google-cloud/datastore';
import { Entity } from '@google-cloud/datastore/build/src/entity';
import { google, JournalFactoryServiceClient } from '../../../src/cloud';
import { TenantDAO } from '../../../src/services/tenant/dao';
import { ITenantModel } from '../../../src/services/tenant/model';
import { Tx } from '../utils';
export class TestTenant {

   public static run() {

      TestTenant.testDb = new Datastore({ projectId: 'GoogleProjectID' });

      describe(Tx.testInit('seismic store dao tenant test'), () => {
         this.sandbox = sinon.createSandbox();
         beforeEach(() => {

            this.journal = this.sandbox.createStubInstance(google.DatastoreDAO);
            this.journal.createKey.callsFake((specs) => TestTenant.testDb.key(specs));
            this.journal.createQuery.callsFake((namespace, kind) => TestTenant.testDb.createQuery(namespace, kind));

            this.sandbox.stub(JournalFactoryServiceClient, 'get').returns(this.journal);
         });
         afterEach(() => { this.sandbox.restore(); });

         this.testGet();
         this.testGetAll();
         this.testRegister();
         this.testExist();
      });

   }

   private static sandbox: sinon.SinonSandbox;
   private static journal: any;
   private static testDb: Datastore;

   private static testGet() {

      Tx.sectionInit('tenant get');
      Tx.test(async (done: any) => {

         this.journal.get.resolves([{
            esd: 'esd',
            gcpid: 'gcpid',
            name: 'tenant-a',
         } as ITenantModel]);

         const result = await TenantDAO.get('tenant-a');
         Tx.checkTrue(result.name === 'tenant-a' && result.esd === 'esd' && result.gcpid === 'gcpid', done);

      });
   }

   private static testGetAll() {
      Tx.sectionInit('tenant get all');
      Tx.test(async (done: any) => {

         const entity: Entity = {
            esd: 'esd', gcpid: 'gcpid', name: 'tenant-a',
         };
         entity[Datastore.KEY] = this.journal.createKey(
            { namespace: 'seismic-store-ns', path: ['tenants', 'tenant-a'] });

         this.journal.runQuery.resolves([[
            entity,
         ]]);

         const results = await TenantDAO.getAll();
         Tx.checkTrue(results[0].name === 'tenant-a' && results[0].esd === 'esd' && results[0].gcpid === 'gcpid', done);
      });
   }

   private static testRegister() {
      Tx.sectionInit('tenant register');
      Tx.test(async (done: any) => {
         this.journal.save.resolves();
         await TenantDAO.register({ esd: 'esd', gcpid: 'gcpid', name: 'tenant-a', default_acls: undefined });
         done();
      });

   }

   private static testExist() {
      Tx.sectionInit('tenant exist');
      Tx.test(async (done: any) => {
         this.journal.get.resolves([[{ name: 'tenant-a', esd: 'esd', gcpid: 'gcpid' }]]);
         const result = await TenantDAO.exist({ name: 'tenant-a', esd: 'esd', gcpid: 'gcpid', default_acls: 'default_acls' });
         Tx.checkTrue(result, done);
      });
   }

}
