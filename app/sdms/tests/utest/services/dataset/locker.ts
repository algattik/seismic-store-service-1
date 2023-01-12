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

import sinon from 'sinon';
import { Locker } from '../../../../src/services/dataset/locker';
import { Tx } from '../../utils';

export class DataLockerTest {

    private static sandbox: sinon.SinonSandbox;

    public static run() {

        describe(Tx.testInit('general', true), () => {

            beforeEach(() => {  
                this.sandbox = sinon.createSandbox();
            });

            afterEach(() => { 
                this.sandbox.restore(); 
            });

            this.testcreateWriteLock();
            this.testacquireWriteLock();
            this.testacquireReadLock();
            this.testunlock();
            this.testunlockReadLockSession();

        });

    }

    private static testcreateWriteLock() {

        Tx.sectionInit("test create WriteLock");

        Tx.testExp(async (done: any) => {
            Locker.createWriteLock("lockKey", "lock");
            done();
        });

        Tx.testExp(async (done: any) => {
            this.sandbox.stub(Locker, 'getLock');
            Locker.createWriteLock("lockKey", "lock");
            done();
        });

        Tx.testExp(async (done: any) => {
            this.sandbox.stub(Locker, 'getLock');
            Locker.createWriteLock("lockKey", "idempotentWriteLock");
            done();
        });
    }

    private static testacquireWriteLock() {

        Tx.sectionInit("test acquire WriteLock");

        Tx.testExp(async (done: any) => {
            try {
                await Locker.acquireWriteLock("lockKey", "acquireWriteLock");
            } catch(e) { done(); }
        });

        Tx.testExp(async (done: any) => {
            
            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            this.sandbox.stub(Locker, 'getLock').resolves();

            await Locker.acquireWriteLock("lockKey", "WacquireWriteLock");
            done();
        });

        Tx.testExp(async (done: any) => {
            
            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            this.sandbox.stub(Locker, 'getLock').resolves("WacquireWriteLock");

            await Locker.acquireWriteLock("lockKey", "WacquireWriteLock");
            done();
        });

        Tx.testExp(async (done: any) => {
            
            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            this.sandbox.stub(Locker, 'getLock').resolves("acquireWriteLock");
            this.sandbox.stub(Locker, 'isWriteLock').returns(true);
            this.sandbox.stub(Locker, <any>'set').resolves();
            this.sandbox.stub(Locker, 'releaseMutex').resolves();

            try {
                await Locker.acquireWriteLock("lockKey", "WacquireWriteLock", 'wid');
            } catch(e) { done(); }
        });

        Tx.testExp(async (done: any) => {
            
            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            this.sandbox.stub(Locker, 'getLock').resolves("acquireWriteLock");
            this.sandbox.stub(Locker, 'isWriteLock').returns(true);
            this.sandbox.stub(Locker, <any>'set').resolves();
            this.sandbox.stub(Locker, 'releaseMutex').resolves();

            try {
                await Locker.acquireWriteLock("lockKey", "WacquireWriteLock");
            } catch(e) { done(); }
        });

        Tx.testExp(async (done: any) => {
            
            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            this.sandbox.stub(Locker, 'getLock').resolves("acquireWriteLock");
            this.sandbox.stub(Locker, 'isWriteLock').returns(false);
            this.sandbox.stub(Locker, <any>'set').resolves();
            this.sandbox.stub(Locker, 'releaseMutex').resolves();

            try {
                await Locker.acquireWriteLock("lockKey", "WacquireWriteLock");
            } catch(e) { done(); }
        });

        Tx.testExp(async (done: any) => {
            
            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            this.sandbox.stub(Locker, 'getLock').resolves("acquireWriteLock");
            this.sandbox.stub(Locker, 'isWriteLock').returns(false);
            this.sandbox.stub(Locker, <any>'set').resolves();
            this.sandbox.stub(Locker, 'releaseMutex').resolves();

            try {
                await Locker.acquireWriteLock("lockKey", "WacquireWriteLock", 'wid');
            } catch(e) { done(); }
        });
    }

    private static testacquireReadLock() {
        Tx.sectionInit("test acquire ReadLock");

        Tx.testExp(async (done: any) => {
            try {
                await Locker.acquireReadLock("lockKey", "idempotentReadLock");
            } catch(e) { done(); }
        });

        Tx.testExp(async (done: any) => {

            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            try {
                await Locker.acquireReadLock("lockKey");
            } catch(e) { done(); }
        });

        Tx.testExp(async (done: any) => {

            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            try {
                await Locker.acquireReadLock("lockKey", "", "wid");
            } catch(e) { done(); }
        });

        Tx.testExp(async (done: any) => {

            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            this.sandbox.stub(Locker, 'getLock').resolves("lockValue-a");

            await Locker.acquireReadLock("lockKey", "", "lockValue-a");
            done();
        });

        Tx.testExp(async (done: any) => {

            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            this.sandbox.stub(Locker, 'isWriteLock').returns(false);
            this.sandbox.stub(Locker, 'getLock').resolves("lockValue-a");

            await Locker.acquireReadLock("lockKey", "", "lockValue-a");
            done();
        });

        Tx.testExp(async (done: any) => {

            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            this.sandbox.stub(Locker, 'isWriteLock').returns(false);
            this.sandbox.stub(Locker, 'getLock').resolves(["lockValue-a"]);

            try {
                await Locker.acquireReadLock("lockKey", "", "wid");
            } catch(e) { done(); }
        });

        Tx.testExp(async (done: any) => {

            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            this.sandbox.stub(Locker, 'isWriteLock').returns(false);
            this.sandbox.stub(Locker, 'getLock').resolves();

            try {
                await Locker.acquireReadLock("lockKey", "", "wid");
                done();
            } catch(e) { done(); }
        });

        Tx.testExp(async (done: any) => {

            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            this.sandbox.stub(Locker, 'isWriteLock').returns(false);
            this.sandbox.stub(Locker, 'getLock').resolves();

            try {
                await Locker.acquireReadLock("lockKey");
                done();
            } catch(e) { done(); }
        });

        Tx.testExp(async (done: any) => {

            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            this.sandbox.stub(Locker, 'isWriteLock').returns(false);
            this.sandbox.stub(Locker, 'getLock').resolves(["lockValue-a"]);

            try {
                await Locker.acquireReadLock("lockKey");
                done();
            } catch(e) { done(); }
        });
        
    }

    private static testunlock() {

        Tx.sectionInit("test unlock");

        Tx.testExp(async (done: any) => {

            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            this.sandbox.stub(Locker, 'getLock').resolves(["lockValue-a"]);
            Locker.unlock("lockKey");
            done();
        });

        Tx.testExp(async (done: any) => {

            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            this.sandbox.stub(Locker, 'isWriteLock').returns(true);
            this.sandbox.stub(Locker, 'getLock').resolves(["lockValue-a"]);
            try {
                Locker.unlock("lockKey", 'wid');
                done();
            } catch (e) {done();}
            
        });

        Tx.testExp(async (done: any) => {

            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            this.sandbox.stub(Locker, 'isWriteLock').returns(true);
            this.sandbox.stub(Locker, 'getLock').resolves("lockValue-a");
            try {
                Locker.unlock("lockKey", 'lockValue-a');
                done();
            } catch (e) {done();}
            
        });

        Tx.testExp(async (done: any) => {

            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            this.sandbox.stub(Locker, 'getLock').resolves(["lockValue-a"]);
            Locker.unlock("lockKey", 'wid');
            done();
        });

        Tx.testExp(async (done: any) => {

            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            this.sandbox.stub(Locker, 'getLock').resolves();
            Locker.unlock("lockKey", 'wid');
            done();
        });

        Tx.testExp(async (done: any) => {

            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            this.sandbox.stub(Locker, 'getLock').resolves();
            Locker.unlock("lockKey");
            done();
        });

        Tx.testExp(async (done: any) => {

            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            this.sandbox.stub(Locker, 'getLock').resolves(["lockValue"]);
            Locker.unlock("lockKey", "lockValue");
            done();
        });

    }

    private static testunlockReadLockSession() {

        Tx.sectionInit("test unlock Read Lock Session");

        Tx.testExp(async (done: any) => {

            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            this.sandbox.stub(Locker, 'isWriteLock').returns(false);
            this.sandbox.stub(Locker, 'getLock').resolves(["wid"]);
            Locker.unlockReadLockSession("lockKey", "wid");
            done();
        });

        Tx.testExp(async (done: any) => {

            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            this.sandbox.stub(Locker, 'isWriteLock').returns(false);
            this.sandbox.stub(Locker, 'getLock').resolves(["wid-a"]);
            Locker.unlockReadLockSession("lockKey", "wid-b");
            done();
        });

        Tx.testExp(async (done: any) => {

            this.sandbox.stub(Locker, 'acquireMutex').resolves();
            this.sandbox.stub(Locker, 'isWriteLock').returns(true);
            this.sandbox.stub(Locker, 'getLock').resolves(["wid"]);
            Locker.unlockReadLockSession("lockKey", "wid");
            done();
        });

    }
}