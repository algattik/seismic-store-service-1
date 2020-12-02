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

import { Utils } from '../../../src/shared';
import { Tx } from '../utils';

import sinon from 'sinon';

export class TestUtils {
   public static spy: sinon.SinonSandbox;
   public static jwtToken: string;

   public static run() {
      describe(Tx.testInit('seismic store shared utils'), () => {
         beforeEach(() => { this.spy = sinon.createSandbox(); });
         afterEach(() => { this.spy.restore(); });

         this.testGetPropertyFromTokenPayload();
         this.testGetIssFromPayload();
         this.testExpTimeFromPayload();
         this.testGetEmailFromTokenPayload();
         this.testMakeID();

      });

      this.jwtToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQGVtYWls
      IiwiaXNzIjoiYXV0aC1pc3N1ZXIiLCJhdWQiOiJhdWRpZW5jZTAxIiwiaWF0IjoxNTcyOTc0MjkxLC
      JleHAiOjE1NzMwNjA2OTEsInByb3ZpZGVyIjoiY29tcCIsImNsaWVudCI6ImctYXBwIiwidXNlcmlk
      IjoidXNlckBlbWFpbCIsImVtYWlsIjoidXNlckBlbWFpbCIsImF1dGh6IjoiYXV0aHotaW5mbyIsIm
      xhc3RuYW1lIjoidXNlci1sYXN0bmFtZSIsImZpcnN0bmFtZSI6InVzZXItZmlyc3RuYW1lIiwiY291
      bnRyeSI6IiIsImNvbXBhbnkiOiIiLCJqb2J0aXRsZSI6IiIsInN1YmlkIjoiMWVuVmZkc2FvOTRsNm
      Y2aVNSWERxMmR3IiwiaWRwIjoibzM2NSIsImhkIjoiY29tcC5jb20iLCJkZXNpZCI6InVzZXJAY29t
      cC5kZXNpZC5jb20iLCJjb250YWN0X2VtYWlsIjoidXNlckBlbWFpbCJ9.vC2Iw7lShi-JKNaPwDAM4
      V7XIxEqYMs9NXSFlSlZIDc`;
   }

   private static testGetPropertyFromTokenPayload() {
      Tx.sectionInit('get property from token payload');

      Tx.test((done: any) => {
         const emailid = Utils.getPropertyFromTokenPayload(this.jwtToken, 'desid');
         Tx.checkTrue(emailid === 'user@comp.desid.com', done);
      });

   }

   private static testGetIssFromPayload() {
      Tx.sectionInit('get iss from token payload');

      Tx.test((done: any) => {
         const emailid = Utils.getPropertyFromTokenPayload(this.jwtToken, 'iss');
         Tx.checkTrue(emailid === 'auth-issuer', done);
      });

   }

   private static testExpTimeFromPayload() {

      Tx.sectionInit('get expiry time from payload');

      Tx.test((done: any) => {
         const expiryTime = Utils.getExpTimeFromPayload(this.jwtToken);
         Tx.checkTrue(expiryTime === 1573060691, done);
      });
   }

   private static testGetEmailFromTokenPayload() {

      Tx.sectionInit('get email from payload');

      Tx.test((done: any) => {
         const email = Utils.getEmailFromTokenPayload(this.jwtToken);
         Tx.checkTrue(email === 'user@email', done);
      });

   }
   private static testMakeID() {

      Tx.sectionInit('test make id');

      Tx.test((done: any) => {
         const randomid = Utils.makeID(10);
         Tx.checkTrue(randomid.length === 10, done);
      });

   }
}
