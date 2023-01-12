// ============================================================================
// Copyright 2017-2023, Schlumberger
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

import { Params } from '../../../src/shared';
import { Tx } from '../utils';

import sinon from 'sinon';

export class TestParams {
   public static spy: sinon.SinonSandbox;

   public static run() {

      describe(Tx.testInit('seismic store shared logger test'), () => {

         beforeEach(() => { this.spy = sinon.createSandbox(); });
         afterEach(() => { this.spy.restore(); });

         this.checkBody();
         this.checkArray();
         this.checkEmail();
         this.checkDatasetPath();
         this.checkBoolean();

      });

   }

   private static checkBody() {
      Tx.sectionInit('check body');

      Tx.test((done: any) => {
         const body = { 'a': 'b', 'c': 'd' };
         Params.checkBody(body, true);
         done();
      });

      // body is undefined
      Tx.test((done: any) => {
         const body = {};
         try {
            Params.checkBody(body, true);
         } catch (e) {
            Tx.check400(e.error.code, done);
         }
      });

      Tx.test((done: any) => {
         const body = {};

         const result = Params.checkBody(body, false);
         Tx.checkTrue(result === undefined, done);

      });

      // body is not a object
      Tx.test((done: any) => {
         const body = 100;
         try {
            Params.checkBody(body, true);
         } catch (e) {
            Tx.check400(e.error.code, done);
         }
      });


      Tx.test((done: any) => {
         const body = '';
         try {
            Params.checkBody(body, true);
         } catch (e) {
            Tx.check400(e.error.code, done);
         }
      });

      Tx.test((done: any) => {
         const body = '';
         Params.checkBody(body, false);
         done();
      });
      
   }

   private static checkArray() {
      Tx.sectionInit('check array');


      Tx.test((done: any) => {
         Params.checkArray(['100', '200'], 'array01', true);
         done();
      });

      Tx.test((done: any) => {
         try {
            Params.checkArray('', 'array01', true);
         } catch (e) {
            Tx.check400(e.error.code, done);
         }
      });

      Tx.test((done: any) => {

         const result = Params.checkArray('', 'array01', false);
         Tx.checkTrue(result === undefined, done);

      });

      Tx.test((done: any) => {
         try {
            Params.checkArray(100, 'array01', true);
         } catch (e) {
            Tx.check400(e.error.code, done);
         }
      });
   }

   private static checkEmail() {
      Tx.sectionInit('check email');

      Tx.test((done: any) => {
         Params.checkEmail('user@email.com', 'emailAdress', true);
         done();
      });

      Tx.test((done: any) => {
         Params.checkEmail('', 'emailAdress', false);
         done();
      });

      Tx.test((done: any) => {
         try {
            Params.checkEmail('invalidEmail', 'emailAdress', true);
         }
         catch (e) {
            Tx.check400(e.error.code, done);
         }
      });
   }

   private static checkDatasetPath() {
      Tx.sectionInit('check dataset path');

      Tx.test((done: any) => {
         Params.checkDatasetPath('/a/b/c', 'filepath', true);
         done();
      });

      Tx.test((done: any) => {
         try {
            Params.checkDatasetPath('@$', 'filepath', true);
         } catch (e) {
            Tx.check400(e.error.code, done);
         }

      });

      Tx.test((done: any) => {
         try {
            Params.checkDatasetPath('', 'filepath', true);
         } catch (e) {
            Tx.check400(e.error.code, done);
         }
      });
   }

   private static checkBoolean() {
      Tx.sectionInit('check Boolean');

      Tx.test((done: any) => {
         this.spy.stub(Params, <any>'checkParam').resolves();
         Params.checkBoolean('param', 'fieldName', true);
         done();
      });

   }

}