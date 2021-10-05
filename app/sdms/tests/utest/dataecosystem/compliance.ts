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
import { ConfigGoogle } from '../../../src/cloud/providers/google';
import { DESCompliance } from '../../../src/dataecosystem/compliance';
import { Cache } from '../../../src/shared';
import { Tx } from '../utils';


export class TestCompliance {

   public static run() {

      describe(Tx.testInit('dataecosystem compliance'), () => {

         ConfigGoogle.DATA_PARTITION_REST_HEADER_KEY = 'data-partition-id'

         beforeEach(() => {
            this.sandbox = sinon.createSandbox();
            this.sandbox.stub(google.Credentials.prototype, 'getServiceCredentials').resolves('usertoken');

         });
         afterEach(() => { this.sandbox.restore(); });

         this.isLegalTagValid();
      });

   }

   private static sandbox: sinon.SinonSandbox;
   private static options = {
      headers: {
         'Accept': 'application/json',
         'AppKey': 'appkey',
         'Authorization': 'Bearer usertoken',
         'Content-Type': 'application/json',
         'data-partition-id': 'tenant-a',
      },
      json: { names: ['ltag'] },
      url: Config.DES_SERVICE_HOST_COMPLIANCE + '/legal/v1/legaltags:validate',
   };

   private static isLegalTagValid() {
      Tx.sectionInit('legal tag validity');

      Tx.test(async (done: any) => {
         this.sandbox.stub(Cache.prototype, 'set').resolves();
         const requestStub = this.sandbox.stub(request, 'post');
         requestStub.resolves({
            invalidLegalTags: [],
         });

         const result = await DESCompliance.isLegalTagValid('usertoken', 'ltag', 'tenant-a','appkey');

         requestStub.calledWith(this.options);
         Tx.checkTrue(result && requestStub.calledWith(this.options), done);

      });

      Tx.test(async (done: any) => {
         this.sandbox.stub(Cache.prototype, 'set').resolves();
         const requestStub = this.sandbox.stub(request, 'post');
         requestStub.resolves({
            invalidLegalTags: ['ltag'],
         });

         const result = await DESCompliance.isLegalTagValid('usertoken', 'ltag', 'tenant-a', 'appkey');
         requestStub.calledWith(this.options);
         Tx.checkFalse(result && requestStub.calledWith(this.options), done);

      });

      Tx.test(async (done: any) => {
         this.sandbox.stub(request, 'post').throws();
         this.sandbox.stub(Cache.prototype, 'get').resolves();

         try {
            await DESCompliance.isLegalTagValid('usertoken', 'ltag', 'tenant-a', 'appkey');
         } catch (e) {
            Tx.check500(500, done);
         }
      });

   }

}
