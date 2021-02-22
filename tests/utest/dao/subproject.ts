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
import { google } from '../../../src/cloud/providers';
import { SubProjectDAO, SubProjectModel } from '../../../src/services/subproject';
import { Tx } from '../utils';
import { TenantDAO } from '../../../src/services/tenant';

export class TestSubProject {

   public static run() {
      TestSubProject.testDb = new Datastore({ projectId: 'GPRJ' });

      describe(Tx.testInit('seismic store dao subproject test'), () => {
         this.sandbox = sinon.createSandbox();

         beforeEach(() => {
            this.journal = this.sandbox.createStubInstance(google.DatastoreDAO);
            this.journal.createKey.callsFake((specs) => TestSubProject.testDb.key(specs));
            this.journal.createQuery.callsFake((namespace, kind) => TestSubProject.testDb.createQuery(namespace, kind));
            this.sandbox.stub(TenantDAO, 'get').resolves({default_acls: 'acl@acl.com', esd: 'esd', gcpid: 'gcpid', name: 'name'});

         });
         afterEach(() => { this.sandbox.restore(); });

         this.testRegister();
         this.testGet();
         this.testList();
         this.testDelete();
         this.testGetAll();
      });
   }

   private static sandbox: sinon.SinonSandbox;
   private static journal: any;
   private static testDb: Datastore;

   private static testRegister() {

      Tx.sectionInit('register');

      const spcreate: SubProjectModel = {
         admin: 'me', gcs_bucket: undefined, ltag: 'ltag', name: 'spx01',
         storage_class: 'regional',
         storage_location: 'us-central1', tenant: 'tnx01',

      };

      Tx.test(async (done: any) => {
         this.journal.save.resolves();
         await SubProjectDAO.register(this.journal, { key: 'key', data: spcreate });
         done();
      });
   }

   private static testGet() {

      Tx.sectionInit('get subproject');

      Tx.testExp(async (done: any) => {
         this.journal.get.resolves([{ a: 'b' }]);
         const result = await SubProjectDAO.get(this.journal, 'tenant-a', 'subproject-a', ['key']);
         Tx.checkTrue(result.name === 'subproject-a' && result.tenant === 'tenant-a', done);
      });

      Tx.testExp(async (done: any) => {
         this.journal.get.resolves([]);
         try {
            const result = await SubProjectDAO.get(this.journal, 'tenant-a', 'subproject-a', ['key']);
         } catch (e) {
            Tx.check404(e.error.code, done);
         }
      });
   }

   private static testList() {

      Tx.sectionInit('list subprojects');

      Tx.testExp(async (done: any) => {
         this.journal.runQuery.resolves([[{ name: 'name-1', tenant: 'tenant-1' },
         { name: 'name-2', tenant: 'tenant-2' }],
         { endCursor: 'end', moreResults: 'NO_MORE_RESULTS' }]);
         const entities = await SubProjectDAO.list(this.journal, 'tenant-a');
         Tx.checkTrue(entities.length === 2 && entities[0].tenant === 'tenant-1'
            && entities[1].tenant === 'tenant-2', done);
      });
   }

   private static testDelete() {
      Tx.sectionInit('delete subproject');

      Tx.testExp(async (done: any) => {
         this.journal.delete.resolves();
         await SubProjectDAO.delete(this.journal, ['key']);
         done();
      });
   }

   private static testGetAll() {

      Tx.sectionInit('get all');

      Tx.testExp(async (done: any) => {
         this.journal.runQuery.resolves([[{ name: 'name-1', tenant: 'tenant-1' },
         { name: 'name-2', tenant: 'tenant-2' }],
         { endCursor: 'end', moreResults: 'NO_MORE_RESULTS' }]);
         await SubProjectDAO.getAll(this.journal, 'tenant-a');
         done();
      });

   }
}
