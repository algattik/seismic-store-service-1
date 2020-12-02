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

import redis from 'redis-mock';
import Redlock from 'redlock-async';
import sinon from 'sinon';

import { google, JournalFactoryTenantClient } from '../../../src/cloud';
import { DatasetDAO, DatasetModel } from '../../../src/services/dataset';
import { Locker } from '../../../src/services/dataset/locker';
import { Tx } from '../utils';

export class TestLocker {
	public static run() {
		describe(Tx.testInit('LOCKER'), () => {
			beforeEach(() => {
				this.sandbox = sinon.createSandbox();
				this.dataset = {
					name: 'dataset01',
					path: '/', subproject: 'subproject', tenant: 'tenant'
				} as DatasetModel;
				this.writeLockValueInCache = 'WAxAMSFEssarGGERGEG';
				this.mutliSessionReadLockValueInCache = 'rms:RAxAMSFEssarGGERGEG:RAxAMSCLaMGBERGEG';
				this.redisClient = redis.createClient();
				this.datasetKey = this.dataset.tenant + '/' + this.dataset.subproject + this.dataset.path + this.dataset.name;
				this.sampleRedlock = {
					redlock: 'redlock',
					resource: this.datasetKey,
					value: 'random_value',
					ttl: 100,
				};
				this.journal = this.sandbox.createStubInstance(google.DatastoreDAO);

				this.sandbox.stub(JournalFactoryTenantClient, 'get').returns(this.journal);

			});
			afterEach(() => {
				this.sandbox.restore();
				this.redisClient.flushall();
			});
			this.testIsWriteLock();
			this.testGetLock();
			this.testDeleteLock();
			this.testCreateWriteLock();
			this.testAcquireWriteLock();
			this.testAcquireReadLock();
			this.testUnlock();
			this.testUnlockReadLockSession();
			this.acquireMutex();
			this.releaseMutex();

		});
	}

	private static sandbox: sinon.SinonSandbox;

	private static dataset: DatasetModel;
	private static writeLockValueInCache;
	private static mutliSessionReadLockValueInCache;
	private static redisClient: redis.RedisClient;
	private static datasetKey: string;
	private static sampleRedlock: object;
	private static journal: any;


	private static testIsWriteLock() {
		Tx.sectionInit('is write lock');

		Tx.test((done: any) => {
			const result = Locker.isWriteLock(this.writeLockValueInCache);
			Tx.checkTrue(result, done);
		});

		Tx.test((done: any) => {
			const result = Locker.isWriteLock(this.writeLockValueInCache);
			Tx.checkTrue(result, done);
		});

		Tx.test((done: any) => {
			const result = Locker.isWriteLock(['RAxAMSFEssarGGERGEG']);
			Tx.checkFalse(result, done);
		});
	}

	private static testGetLock() {
		Tx.sectionInit('get lock');

		Tx.test(async (done: any) => {
			this.sandbox.stub(Locker, 'get' as any).resolves(this.writeLockValueInCache);
			const result = await Locker.getLockFromModel(this.dataset);
			Tx.checkTrue(result === this.writeLockValueInCache, done);
		});
	}

	private static testDeleteLock() {
		Tx.sectionInit('delete lock ');

		Tx.test(async (done: any) => {
			this.redisClient.set(this.datasetKey, this.writeLockValueInCache);
			const result = await Locker.del(this.datasetKey);
			Tx.checkTrue(result === 1, done);
		});
	}

	private static testCreateWriteLock() {
		Tx.sectionInit('create write lock');

		Tx.test(async (done: any) => {
			this.sandbox.stub(Redlock.prototype, 'lock').resolves();

			await Locker.createWriteLock(this.dataset);

			this.redisClient.get(this.datasetKey, (err, response) => {
				Tx.checkTrue(this.dataset.sbit === response.toString(), done);
			});
		});

		Tx.test(async (done: any) => {
			this.sandbox.stub(Redlock.prototype, 'lock').resolves(this.sampleRedlock);

			this.sandbox.stub(Locker, 'acquireMutex').rejects();
			try {
				await Locker.createWriteLock(this.dataset);
			} catch (e) {
				done();
			}
		});
	}

	private static testAcquireWriteLock() {

		Tx.sectionInit('acquire write lock');

		// unlocked dataset
		Tx.test(async (done: any) => {
			this.sandbox.stub(Locker, 'acquireMutex').resolves();
			this.sandbox.stub(Locker, 'getLock' as any).resolves(this.writeLockValueInCache);

			try {
				await Locker.acquireWriteLock(this.journal, this.dataset, 'WAxBxCx');
			} catch (e) {
				Tx.checkTrue(e.error.code === 423, done);
			}
		});

		// unlocked dataset
		Tx.test(async (done: any) => {
			this.sandbox.stub(Locker, 'acquireMutex').resolves();
			this.sandbox.stub(Locker, 'getLock' as any).resolves(undefined);
			this.sandbox.stub(Locker, 'releaseMutex').resolves();
			this.dataset.sbit = 'WAxBxCx';
			this.sandbox.stub(DatasetDAO, 'get').resolves([this.dataset, '']);

			try {
				await Locker.acquireWriteLock(this.journal, this.dataset);
			} catch (e) {
				Tx.checkTrue(e.error.code === 400, done);
			}
		});

		// unlocked dataset
		Tx.test(async (done: any) => {
			this.sandbox.stub(Locker, 'acquireMutex').resolves();
			this.sandbox.stub(Locker, 'getLock' as any).resolves(undefined);
			this.sandbox.stub(Locker, 'releaseMutex').resolves();
			this.sandbox.stub(DatasetDAO, 'get').resolves([this.dataset, undefined]);
			this.sandbox.stub(DatasetDAO, 'update').resolves();

			const result = await Locker.acquireWriteLock(this.journal, this.dataset);

			Tx.checkTrue(result.id != null && result.cnt === 1, done);

		});

		// already locked dataset
		Tx.test(async (done: any) => {
			this.sandbox.stub(Locker, 'acquireMutex').resolves();
			this.sandbox.stub(Locker, 'getLock' as any).resolves(this.writeLockValueInCache);
			this.sandbox.stub(Locker, 'releaseMutex').resolves();

			// no wid from userinput
			try {
				await Locker.acquireWriteLock(this.journal, this.dataset, undefined);
			} catch (e) {
				Tx.checkTrue(e.error.code === 423, done);
			}

		});

		// already locked dataset
		Tx.test(async (done: any) => {
			this.sandbox.stub(Locker, 'acquireMutex').resolves();
			this.sandbox.stub(Locker, 'getLock' as any).resolves(this.writeLockValueInCache);
			this.sandbox.stub(Locker, 'releaseMutex').resolves();

			// lock value in the cache and the user supplied wid mismatch
			try {
				await Locker.acquireWriteLock(this.journal, this.dataset, 'AxBxCx');
			} catch (e) {
				Tx.checkTrue(e.error.code === 423, done);
			}

		});

		// already locked dataset
		Tx.test(async (done: any) => {
			this.sandbox.stub(Locker, 'acquireMutex').resolves();

			// lock value in the cache is a multi session read locks string
			this.redisClient.set(this.datasetKey, this.mutliSessionReadLockValueInCache);

			const sessionReadLockValue: string = this.mutliSessionReadLockValueInCache.substr(4).split(':')[0];
			const mutliSessionReadLockArray: string[] = this.mutliSessionReadLockValueInCache.substr(4).split(':');
			this.sandbox.stub(Locker, 'releaseMutex').resolves();

			// the wid is a session readlock value;
			const result = await Locker.acquireWriteLock(this.journal, this.dataset, sessionReadLockValue);
			Tx.checkTrue(result.id === sessionReadLockValue && result.cnt === mutliSessionReadLockArray.length, done);

		});

		// already locked dataset
		Tx.test(async (done: any) => {
			this.sandbox.stub(Locker, 'acquireMutex').resolves();

			// lock value in the cache is a multi session read locks string
			this.redisClient.set(this.datasetKey, this.mutliSessionReadLockValueInCache);

			const sessionReadLockValue: string = this.mutliSessionReadLockValueInCache.substr(4).split(':')[0];
			this.sandbox.stub(Locker, 'releaseMutex').resolves();

			// the wid value is not present in the multi session read locks string;
			try {
				await Locker.acquireWriteLock(this.journal, this.dataset, 'RRandomReadLockValue');
			} catch (e) {
				Tx.checkTrue(e.error.code === 423, done);
			}

		});

	}
	private static testAcquireReadLock() {

		Tx.sectionInit('acquire read lock');

		// already locked with write lock
		Tx.test(async (done: any) => {
			this.sandbox.stub(Locker, 'acquireMutex').resolves();
			this.sandbox.stub(Locker, 'releaseMutex').resolves();
			this.sandbox.stub(Locker, 'getLock' as any).resolves(this.writeLockValueInCache);

			try {
				await Locker.acquireReadLock(this.journal, this.dataset);
			} catch (e) {
				Tx.checkTrue(e.error.code === 423, done);
			}
		});

		// already locked with write lock and wid mismatch
		Tx.test(async (done: any) => {
			this.sandbox.stub(Locker, 'acquireMutex').resolves();
			this.sandbox.stub(Locker, 'releaseMutex').resolves();
			this.sandbox.stub(Locker, 'getLock' as any).resolves(this.writeLockValueInCache);

			const wid = this.writeLockValueInCache + '-mismatch-value';

			try {
				await Locker.acquireReadLock(this.journal, this.dataset, wid);
			} catch (e) {
				Tx.checkTrue(e.error.code === 423, done);
			}
		});

		// already locked with write lock and wid matches
		Tx.test(async (done: any) => {
			this.sandbox.stub(Locker, 'acquireMutex').resolves();
			this.sandbox.stub(Locker, 'releaseMutex').resolves();
			this.sandbox.stub(Locker, 'getLock' as any).resolves(this.writeLockValueInCache);

			const wid = this.writeLockValueInCache;
			const result = await Locker.acquireReadLock(this.journal, this.dataset, wid);

			Tx.checkTrue(result.id === wid && result.cnt === 1, done);
		});

		// already locked with mutlisession read lock
		Tx.test(async (done: any) => {
			this.sandbox.stub(Locker, 'acquireMutex').resolves();
			this.sandbox.stub(Locker, 'releaseMutex').resolves();
			this.sandbox.stub(Locker, 'getLock' as any).resolves(this.mutliSessionReadLockValueInCache);

			// const sessionReadLockValue: string = this.mutliSessionReadLockValue.substr(4).split(':')[0];
			// const mutliSessionReadLockArray: string[] = this.mutliSessionReadLockValue.substr(4).split(':');

			const wid = 'read-lock-not-in-mutlisession-readlock';
			try {
				const result = await Locker.acquireReadLock(this.journal, this.dataset, wid);
			} catch (e) {
				Tx.checkTrue(e.error.code === 423, done);
			}
		});

		// unlocked dataset with no value in cache but sbit in datastore is not null
		Tx.test(async (done: any) => {
			this.sandbox.stub(Locker, 'acquireMutex').resolves();
			this.sandbox.stub(Locker, 'releaseMutex').resolves();
			this.sandbox.stub(Locker, 'getLock' as any).resolves(undefined);
			this.dataset.sbit = 'sbit';
			this.sandbox.stub(DatasetDAO, 'get').resolves([this.dataset, undefined]);

			try {
				const result = await Locker.acquireReadLock(this.journal, this.dataset);
			} catch (e) {
				Tx.checkTrue(e.error.code === 400, done);
			}
		});


		// unlocked dataset with no value in cache
		Tx.test(async (done: any) => {
			this.sandbox.stub(Locker, 'acquireMutex').resolves();
			this.sandbox.stub(Locker, 'releaseMutex').resolves();
			this.sandbox.stub(Locker, 'getLock' as any).resolves(undefined);
			this.sandbox.stub(DatasetDAO, 'get').resolves([this.dataset, undefined]);

			const readlockID = 'RAxBxCx';
			this.sandbox.stub(Locker, 'generateReadLockID' as any).returns(readlockID);

			const result = await Locker.acquireReadLock(this.journal, this.dataset);

			Tx.checkTrue(result.id === readlockID && result.cnt === 1, done);
		});


		// unlocked dataset with multisession read lock value in cache
		Tx.test(async (done: any) => {


			const readlockID = 'RAxBxCx';
			// const sessionReadLockValue: string = this.mutliSessionReadLockValue.substr(4).split(':')[0];
			const mutliSessionReadLockArray: string[] = this.mutliSessionReadLockValueInCache.substr(4).split(':');
			this.sandbox.stub(Locker, 'acquireMutex').resolves();
			this.sandbox.stub(Locker, 'releaseMutex').resolves();
			this.sandbox.stub(DatasetDAO, 'get').resolves([this.dataset, undefined]);
			this.sandbox.stub(Locker, 'getLock' as any).resolves(mutliSessionReadLockArray);
			this.sandbox.stub(Locker, 'generateReadLockID' as any).returns(readlockID);

			const result = await Locker.acquireReadLock(this.journal, this.dataset);

			Tx.checkTrue(result.id === readlockID && result.cnt === 3, done);

		});

	}

	private static testUnlock() {
		Tx.sectionInit('unlock');

		// write lock cache value differs from the wid
		Tx.test(async (done: any) => {
			this.sandbox.stub(Locker, 'acquireMutex').resolves();
			this.sandbox.stub(Locker, 'releaseMutex').resolves();
			this.sandbox.stub(Locker, 'getLock' as any).resolves(this.writeLockValueInCache);

			const wid = 'WRandomValue';
			try {
				await Locker.unlock(this.journal, this.dataset, wid);
			} catch (e) {
				Tx.checkTrue(e.error.code === 404, done);
			}
		});

		Tx.test(async (done: any) => {
			this.sandbox.stub(Locker, 'acquireMutex').resolves();
			this.sandbox.stub(Locker, 'releaseMutex').resolves();
			this.sandbox.stub(Locker, 'getLock' as any).resolves(this.writeLockValueInCache);
			this.sandbox.stub(DatasetDAO, 'get').resolves(this.dataset as any);
			this.sandbox.stub(DatasetDAO, 'update').resolves();

			const lockerDelStub = this.sandbox.stub(Locker, 'del');
			lockerDelStub.resolves();
			const wid = this.writeLockValueInCache;

			const result = await Locker.unlock(this.journal, this.dataset, wid);

			Tx.checkTrue(lockerDelStub.calledWith(this.datasetKey) && result.id === null && result.cnt === 0, done);

		});

		// cache has write lock but the user does not supply wid
		Tx.test(async (done: any) => {
			this.sandbox.stub(Locker, 'acquireMutex').resolves();
			this.sandbox.stub(Locker, 'releaseMutex').resolves();
			this.sandbox.stub(Locker, 'getLock' as any).resolves(this.writeLockValueInCache);
			this.sandbox.stub(DatasetDAO, 'get').resolves([this.dataset, undefined]);
			this.sandbox.stub(DatasetDAO, 'update').resolves();

			const lockerDelStub = this.sandbox.stub(Locker, 'del');
			lockerDelStub.resolves();

			const result = await Locker.unlock(this.journal, this.dataset);

			Tx.checkTrue(lockerDelStub.calledWith(this.datasetKey) && result.id === null && result.cnt === 0, done);

		});


		// cache has multi session read lock but the user does not supply wid
		Tx.test(async (done: any) => {
			this.sandbox.stub(Locker, 'acquireMutex').resolves();
			this.sandbox.stub(Locker, 'releaseMutex').resolves();
			const mutliSessionReadLockArray: string[] = this.mutliSessionReadLockValueInCache.substr(4).split(':');
			this.sandbox.stub(Locker, 'getLock' as any).resolves(mutliSessionReadLockArray);
			this.sandbox.stub(DatasetDAO, 'get').resolves([this.dataset, undefined]);
			this.sandbox.stub(DatasetDAO, 'update').resolves();

			const lockerDelStub = this.sandbox.stub(Locker, 'del');
			lockerDelStub.resolves();

			const result = await Locker.unlock(this.journal, this.dataset);

			const validationResult = lockerDelStub.getCall(0).calledWith(this.datasetKey + '/' + mutliSessionReadLockArray[0]) &&
				lockerDelStub.getCall(1).calledWith(this.datasetKey + '/' + mutliSessionReadLockArray[1]) &&
				lockerDelStub.getCall(2).calledWith(this.datasetKey);

			Tx.checkTrue(validationResult === true && result.id === null && result.cnt === 0, done);

		});


		// cache has multi session read lock and the user supplies a wid
		// which is in the cache's mutlisession read lock value
		Tx.test(async (done: any) => {
			this.sandbox.stub(Locker, 'acquireMutex').resolves();
			this.sandbox.stub(Locker, 'releaseMutex').resolves();
			const mutliSessionReadLockArray: string[] = this.mutliSessionReadLockValueInCache.substr(4).split(':');
			this.sandbox.stub(Locker, 'getLock' as any).resolves(mutliSessionReadLockArray);
			this.sandbox.stub(DatasetDAO, 'get').resolves([this.dataset, undefined]);
			this.sandbox.stub(DatasetDAO, 'update').resolves();

			const lockerDelStub = this.sandbox.stub(Locker, 'del');
			lockerDelStub.resolves();

			const wid = mutliSessionReadLockArray[0];

			const setLockStub = this.sandbox.stub(Locker, 'setLock' as any);
			setLockStub.resolves();

			this.sandbox.stub(Locker, 'getTTL' as any).resolves(3600);


			const result = await Locker.unlock(this.journal, this.dataset, wid);

			// during unlock, wid should be removed from the mutli session read lock array
			// and the new array value must be reset in cache
			mutliSessionReadLockArray.shift();
			const validationResult = setLockStub.calledWith(this.datasetKey, mutliSessionReadLockArray, 3600)
				&& lockerDelStub.calledWith(this.datasetKey + '/' + wid);

			Tx.checkTrue(validationResult === true && result.id === mutliSessionReadLockArray[0] && result.cnt === 1, done);

		});

		// cache has multi session read lock and the user supplies a wid
		// which is not in the cache's mutlisession read lock value
		Tx.test(async (done: any) => {
			this.sandbox.stub(Locker, 'acquireMutex').resolves();
			this.sandbox.stub(Locker, 'releaseMutex').resolves();
			const mutliSessionReadLockArray: string[] = this.mutliSessionReadLockValueInCache.substr(4).split(':');
			this.sandbox.stub(Locker, 'getLock' as any).resolves(mutliSessionReadLockArray);
			this.sandbox.stub(DatasetDAO, 'get').resolves([this.dataset, undefined]);
			this.sandbox.stub(DatasetDAO, 'update').resolves();

			const lockerDelStub = this.sandbox.stub(Locker, 'del');
			lockerDelStub.resolves();

			const wid = 'WSomeRandom';

			try {
				await Locker.unlock(this.journal, this.dataset, wid);
			} catch (e) {
				Tx.checkTrue(e.error.code === 404, done);
			}

		});


		// cache was no lock value for the dataset but the user supplies wid
		Tx.test(async (done: any) => {

			const wid = 'WSomeRandom';
			this.dataset.sbit = 'WSomeRandom';

			this.sandbox.stub(Locker, 'acquireMutex').resolves();
			this.sandbox.stub(Locker, 'releaseMutex').resolves();
			this.sandbox.stub(Locker, 'getLock' as any).resolves(undefined);
			this.sandbox.stub(DatasetDAO, 'get').resolves([this.dataset, undefined]);
			this.sandbox.stub(DatasetDAO, 'update').resolves();

			try {
				await Locker.unlock(this.journal, this.dataset, wid, false);
			} catch (e) {
				Tx.checkTrue(e.error.code === 404, done);
			}

		});

		// cache was no lock value for the dataset but the user supplies wid
		Tx.test(async (done: any) => {

			const wid = 'WSomeRandom';
			this.dataset.sbit = 'WSomeRandom';

			this.sandbox.stub(Locker, 'acquireMutex').resolves();
			this.sandbox.stub(Locker, 'releaseMutex').resolves();
			this.sandbox.stub(Locker, 'getLock' as any).resolves(undefined);
			this.sandbox.stub(DatasetDAO, 'get').resolves([this.dataset, undefined]);
			this.sandbox.stub(DatasetDAO, 'update').resolves();

			const result = await Locker.unlock(this.journal, this.dataset, wid, true);

			Tx.checkTrue(result.id === null && result.cnt === 0, done);

		});

	}

	private static testUnlockReadLockSession() {
		Tx.sectionInit('unlock readlock session');

		// cache contains a multi session read lock value and the
		// user supplies a wid present in the multi session read lock value
		Tx.test(async (done: any) => {
			const mutliSessionReadLockArray: string[] = this.mutliSessionReadLockValueInCache.substr(4).split(':');
			const wid = mutliSessionReadLockArray[0];

			this.sandbox.stub(Locker, 'acquireMutex').resolves();
			this.sandbox.stub(Locker, 'releaseMutex').resolves();
			this.sandbox.stub(Locker, 'getLock' as any).resolves(mutliSessionReadLockArray);
			this.sandbox.stub(Locker, 'getTTL' as any).resolves(3600);

			const lockerDelStub = this.sandbox.stub(Locker, 'del');
			lockerDelStub.resolves();

			const setLockStub = this.sandbox.stub(Locker, 'setLock' as any);
			setLockStub.resolves();

			await Locker.unlockReadLockSession(this.datasetKey, wid);

			mutliSessionReadLockArray.shift();
			const validationResult = setLockStub.calledWith(this.datasetKey, mutliSessionReadLockArray, 3600);
			Tx.checkTrue(validationResult === true, done);

		});



		// cache contains a multi session read lock value and the
		// user supplies a wid present in the multi session read lock value
		Tx.test(async (done: any) => {
			const mutliSessionReadLockArray: string[] = ['RAxBxCx'];
			const wid = mutliSessionReadLockArray[0];

			this.sandbox.stub(Locker, 'acquireMutex').resolves();
			this.sandbox.stub(Locker, 'releaseMutex').resolves();
			this.sandbox.stub(Locker, 'getLock' as any).resolves(mutliSessionReadLockArray);
			this.sandbox.stub(Locker, 'getTTL' as any).resolves(3600);

			const lockerDelStub = this.sandbox.stub(Locker, 'del');
			lockerDelStub.resolves();

			await Locker.unlockReadLockSession(this.datasetKey, wid);

			const validationResult = lockerDelStub.calledWith(this.datasetKey);
			Tx.checkTrue(validationResult === true, done);

		});
	}

	private static acquireMutex() {

		Tx.sectionInit('acquire mutex');

		Tx.test(async (done: any) => {
			const cacheLock = { lock: 'cachelock' };
			this.sandbox.stub(Redlock.prototype, 'lock').resolves(cacheLock);
			const result = await Locker.acquireMutex(this.datasetKey);
			Tx.checkTrue(result === cacheLock, done);

		});

		Tx.test(async (done: any) => {
			const cacheLock = { lock: 'cachelock' };
			this.sandbox.stub(Redlock.prototype, 'lock').rejects();
			try {
				await Locker.acquireMutex(this.datasetKey);
			} catch (e) {
				Tx.checkTrue(e.error.code === 423, done);
			}
		});
	}

	private static releaseMutex() {

		Tx.sectionInit('release mutex');

		Tx.test(async (done: any) => {
			const cacheLock = { lock: 'cachelock' };
			this.sandbox.stub(Redlock.prototype, 'unlock').resolves();
			await Locker.releaseMutex(cacheLock, this.datasetKey);
			done();
		});

		Tx.test(async (done: any) => {
			const cacheLock = { lock: 'cachelock' };
			this.sandbox.stub(Redlock.prototype, 'unlock').rejects();
			try {
				await Locker.releaseMutex(cacheLock, this.datasetKey);
			} catch (e) {
				Tx.checkTrue(e.error.code === 423, done);
			}

		});
	}


}
