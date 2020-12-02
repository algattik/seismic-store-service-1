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

import { Error } from '../../../src/shared/error';
import { Tx } from '../utils';

export class TestErrorSHD {

   public static run() {

      describe(Tx.testInit('seismic store shared error test'), () => {
         this.testMake();
         this.testMakeForHttpRequest();
      });

   }

   private static testMake() {
      Tx.sectionInit('make');

      Tx.test((done) => {
         const result = Error.make(500, 'message', 'mexprefix');
         Tx.checkTrue(result.error.code === 500 && result.error.message === 'mexprefix message'
            && result.error.status === 'UNKNOWN', done);

      });

      Tx.test((done) => {
         const result = Error.make(409, 'message', 'mexprefix');
         Tx.checkTrue(result.error.code === 409 && result.error.message === 'mexprefix message'
            && result.error.status === 'ALREADY_EXISTS', done);

      });

      Tx.test((done) => {
         const result = Error.make(423, 'message', 'mexprefix');
         Tx.checkTrue(result.error.code === 423 && result.error.message === 'mexprefix message'
            && result.error.status === 'LOCKED', done);

      });

      Tx.test((done) => {
         const result = Error.make(404, 'message', 'mexprefix');
         Tx.checkTrue(result.error.code === 404 && result.error.message === 'mexprefix message'
            && result.error.status === 'NOT_FOUND', done);

      });

      Tx.test((done) => {
         const result = Error.make(403, 'message', 'mexprefix');
         Tx.checkTrue(result.error.code === 403 && result.error.message === 'mexprefix message'
            && result.error.status === 'PERMISSION_DENIED', done);
      });

      Tx.test((done) => {
         const result = Error.make(401, 'message', 'mexprefix');
         Tx.checkTrue(result.error.code === 401 && result.error.message === 'mexprefix message'
            && result.error.status === 'UNAUTHENTICATED', done);
      });

   }

   private static testMakeForHttpRequest() {

      Tx.test((done: any) => {
         const result = Error.makeForHTTPRequest({
            error: 'error',
            message: 'error',
            name: 'StatusCodeError',
            statusCode: 402,
         });
         Tx.checkTrue(result.error.code === 402 &&
            result.error.message === '[seismic-store-service] error' &&
            result.error.status === 'UNKNOWN', done);
      });

   }
}
