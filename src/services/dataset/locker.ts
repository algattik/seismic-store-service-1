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

import Redlock from 'redlock-async';
import { DatasetModel } from '.';
import { IJournal, IJournalTransaction } from '../../cloud';
import { Config } from '../../cloud';
import { Error, Utils } from '../../shared';
import { DatasetDAO } from './dao';

// lock interface (this is the cache entry)
interface ILock { id: string; cnt: number; }

// Write Lock interface
export interface IWriteLockSession {idempotent: boolean, wid: string, mutex: any, key: string};

export class Locker {

    private static TTL = 20000; // max lock time in ms
    private static EXP_WRITELOCK = 86400; // after 24h writelock entry will be removed
    private static EXP_READLOCK = 3600; // after 1h  readlock entry will be removed
    private static TIME_5MIN = 300; // exp time margin to use in the main read locks

    // the redis client
    private static redisClient;
    private static redisSubscriptionClient;
    private static redlock;

    public static async init() {

        if (Config.UTEST) {
            const redis = require('redis-mock');
            this.redisClient = redis.createClient();
            this.redisSubscriptionClient = redis.createClient();
        } else {
            const redis = require('redis');
            if(Config.LOCKSMAP_REDIS_INSTANCE_KEY) {
                this.redisClient = redis.createClient({
                    host: Config.LOCKSMAP_REDIS_INSTANCE_ADDRESS,
                    port: Config.LOCKSMAP_REDIS_INSTANCE_PORT,
                    auth_pass: Config.LOCKSMAP_REDIS_INSTANCE_KEY,
                    tls: {servername: Config.LOCKSMAP_REDIS_INSTANCE_ADDRESS}}
                );
                this.redisSubscriptionClient = redis.createClient({
                    host: Config.LOCKSMAP_REDIS_INSTANCE_ADDRESS,
                    port: Config.LOCKSMAP_REDIS_INSTANCE_PORT,
                    auth_pass: Config.LOCKSMAP_REDIS_INSTANCE_KEY,
                    tls: {servername: Config.LOCKSMAP_REDIS_INSTANCE_ADDRESS}}
                );
            }
            else {
                this.redisClient = redis.createClient({
                    host: Config.LOCKSMAP_REDIS_INSTANCE_ADDRESS,
                    port: Config.LOCKSMAP_REDIS_INSTANCE_PORT,
                });
                this.redisSubscriptionClient = redis.createClient({
                    host: Config.LOCKSMAP_REDIS_INSTANCE_ADDRESS,
                    port: Config.LOCKSMAP_REDIS_INSTANCE_PORT,
                });
            }

            // This will automaticcally remove the wid entries from the main read lock
            this.redisSubscriptionClient.on('message', (channel, key) => {
                if (channel === '__keyevent@0__:expired') {
                    Locker.unlockReadLockSession(
                        key.substr(0, key.lastIndexOf('/')),
                        key.substr(key.lastIndexOf('/') + 1)
                    );
                }
            });
        }

        // initialize the locker
        this.redlock = new Redlock([this.redisClient], {
            // the expected clock drift; for more details
            // see http://redis.io/topics/distlock
            driftFactor: 0.01, // time in ms
            // the max number of times Redlock will attempt
            // to lock a resource before erroring
            retryCount: 10,
            // the time in ms between attempts
            retryDelay: 200, // time in ms
            // the max time in ms randomly added to retries
            // to improve performance under high contention
            // see https://www.awsarchitectureblog.com/2015/03/backoff.html
            retryJitter: 200, // time in ms
        });
    }

    private static generateReadLockID(): string {
        return 'R' + Utils.makeID(15);
    }

    private static generateWriteLockID(): string {
        return 'W' + Utils.makeID(15);
    }

    public static isWriteLock(lock: string[] | string): boolean {
        return typeof (lock) === 'string';
    }

    public static async getLockFromModel(dataset: DatasetModel): Promise<string[] | string> {
        return await this.getLock(dataset.tenant + '/' + dataset.subproject + dataset.path + dataset.name);
    }

    private static async getLock(key: string): Promise<string[] | string> {
        const entity = await this.get(key);
        return entity ? entity.startsWith('rms') ? entity.substr(4).split(':') : entity : undefined;
    }

    private static async setLock(key: string, value: string[] | string, exptime: number): Promise<string> {
        return value ? typeof (value) === 'string' ?
            await this.set(key, value as string, exptime) :
            await this.set(key, 'rms:' + (value as string[]).join(':'), exptime) : undefined;
    }

    private static async get(key: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.redisClient.get(key, (err, res) => { err ? reject(err) : resolve(res); });
        });
    }

    private static async set(key: string, value: string, exptime: number): Promise<string> {
        return new Promise((resolve, reject) => {
            this.redisClient.setex(key, exptime, value, (err, res) => { err ? reject(err) : resolve(res); });
        });
    }

    public static async del(key: string): Promise<number> {
        return new Promise((resolve, reject) => {
            this.redisClient.del(key, (err, resp) => { err ? reject(err) : resolve(resp); });
        });
    }

    private static async getTTL(key: string): Promise<number> {
        return new Promise((resolve, reject) => {
            this.redisClient.ttl(key, (err, res) => { err ? reject(err) : resolve(res); });
        });
    }

    // create a write lock for new resources. This is a locking operation!
    // it place the mutex on the required resource!!! (the caller shold remove the mutex)
    public static async createWriteLock(
        dataset: DatasetModel, idempotentWriteLock?: string): Promise<IWriteLockSession> {

        const datasetPath = dataset.tenant + '/' + dataset.subproject + dataset.path + dataset.name;
        const cachelock = await this.acquireMutex(datasetPath);
        const lockValue = (await Locker.getLock(datasetPath));

        // idempotency requirement
        if(idempotentWriteLock && !idempotentWriteLock.startsWith('W')) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The provided idempotency key, for a write-lock operation, must start with the \'W\' letter'));
        }

        // if the lockValue is not present in the rediscache,
        // create the [KEY,VALUE] = [datasetPath, wid(sbit)] pair in the redis cache
        if (!lockValue) {
            dataset.sbit = idempotentWriteLock || this.generateWriteLockID();
            dataset.sbit_count = 1;
            this.set(datasetPath, dataset.sbit, this.EXP_WRITELOCK);
            return {idempotent: false, wid: dataset.sbit, mutex: cachelock, key: datasetPath};
        }

        // check if writelock already exist and match the input one (idempotent call)
        if(idempotentWriteLock && lockValue === idempotentWriteLock) {
            return {idempotent: true, wid: idempotentWriteLock, mutex: cachelock, key: datasetPath};
        }

        throw (Error.make(Error.Status.LOCKED,
            'The dataset ' + datasetPath + ' is ' +
            (this.isWriteLock(lockValue) ? 'write' : 'read') + ' locked'));
    }

    // remove both lock and mutex
    public static async removeWriteLock(writeLockSession: IWriteLockSession, keepTheLock = false): Promise<void> {
        if(writeLockSession && writeLockSession.mutex) {
            await Locker.releaseMutex(writeLockSession.mutex, writeLockSession.key);
        }
        if(!keepTheLock) {
            if (writeLockSession && writeLockSession.wid) {
                await Locker.del(writeLockSession.key);
            }
        }
    }

    // acquire write lock on the resource and update the status on the metadata
    public static async acquireWriteLock(
        journalClient: IJournal | IJournalTransaction, dataset: DatasetModel,
        idempotentWriteLock: string, wid?: string): Promise<ILock> {

        // idempotency requirement
        if(idempotentWriteLock && !idempotentWriteLock.startsWith('W')) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The provided idempotency key, for a write-lock operation, must start with the \'W\' letter'));
        }

        const datasetPath = dataset.tenant + '/' + dataset.subproject + dataset.path + dataset.name;
        const cachelock = await this.acquireMutex(datasetPath);
        const lockValue = (await Locker.getLock(datasetPath));

        // Already write locked but the idempotentWriteLock match the once in cache (idempotent call)
        if(lockValue && idempotentWriteLock && lockValue === idempotentWriteLock) {
            await this.releaseMutex(cachelock, datasetPath);
            return {id: idempotentWriteLock, cnt: 0};
        }

        if (lockValue && wid && wid !== lockValue && this.isWriteLock(lockValue)) {
            await this.releaseMutex(cachelock, datasetPath);
            throw (Error.make(Error.Status.LOCKED,
                'The dataset ' + datasetPath + ' is locked for write with different id'));
        }

        // ------------------------------------------------
        // [01] - unlocked dataset (no lock values)
        // ------------------------------------------------

        if (!lockValue) {

            // check if the dataset is invalid
            const datasetOut = await DatasetDAO.get(journalClient, dataset);
            if (datasetOut[0].sbit) { // write-locked (invalid file)
                await this.releaseMutex(cachelock, datasetPath);
                throw (Error.make(Error.Status.BAD_REQUEST,
                    'The dataset ' + datasetPath + ' is invalid and can only be deleted'));
            }

            // create a new write lock and save in cache and journalClient
            const lockID = idempotentWriteLock || this.generateWriteLockID();
            await Locker.set(datasetPath, lockID, this.EXP_WRITELOCK);
            datasetOut[0].sbit = lockID;
            datasetOut[0].sbit_count = 1;
            await DatasetDAO.update(journalClient, datasetOut[0], datasetOut[1]);

            await this.releaseMutex(cachelock, datasetPath);
            return { id: lockID, cnt: 1 };
        }

        // ------------------------------------------------
        // [02] - locked dataset
        // ------------------------------------------------

        // wid not specified - impossible lock
        if (!wid) {
            await this.releaseMutex(cachelock, datasetPath);
            throw (Error.make(Error.Status.LOCKED,
                'The dataset ' + datasetPath + ' is locked for ' + (this.isWriteLock(lockValue) ? 'write' : 'read')));
        }

        // write locked and different wid
        if (this.isWriteLock(lockValue) && wid !== lockValue) {
            await this.releaseMutex(cachelock, datasetPath);
            throw (Error.make(Error.Status.LOCKED,
                'The dataset ' + datasetPath + ' is locked for write with different id'));
        }

        if (!this.isWriteLock(lockValue) && lockValue.indexOf(wid) === -1) {
            await this.releaseMutex(cachelock, datasetPath);
            throw (Error.make(Error.Status.LOCKED,
                'The dataset ' + datasetPath + ' is locked for read widh different ids'));
        }

        // Trusted Open
        await this.releaseMutex(cachelock, datasetPath);
        return { id: wid, cnt: this.isWriteLock(lockValue) ? 1 : (lockValue as string[]).length };

    }

    // create lock existing resource
    public static async acquireReadLock(
        journalClient: IJournal | IJournalTransaction, dataset: DatasetModel,
        idempotentReadLock?: string, wid?: string): Promise<ILock> {

        // idempotency requirement
        if(idempotentReadLock && !idempotentReadLock.startsWith('R')) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The provided idempotency key, for a read-lock operation, must start with the \'R\' letter'));
        }

        const datasetPath = dataset.tenant + '/' + dataset.subproject + dataset.path + dataset.name;
        const cachelock = await this.acquireMutex(datasetPath);
        const lockValue = (await Locker.getLock(datasetPath));

        if(lockValue && idempotentReadLock && !this.isWriteLock(lockValue) &&
            (lockValue as string[]).indexOf(idempotentReadLock) > -1) {
            await this.releaseMutex(cachelock, datasetPath);
            return { id: idempotentReadLock, cnt: (lockValue as string[]).length };
        }

        if (this.isWriteLock(lockValue)) {

            // wid not specified -> error locked for write
            if (!wid) {
                await this.releaseMutex(cachelock, datasetPath);
                throw (Error.make(Error.Status.LOCKED,
                    'The dataset ' + datasetPath + ' is locked for write'));
            }

            // wid different -> error different wid
            if (wid !== lockValue) {
                await this.releaseMutex(cachelock, datasetPath);
                throw (Error.make(Error.Status.LOCKED,
                    'The dataset ' + datasetPath + ' is locked for write with different wid'));
            }

            // wid match -> TRUSTED OPEN
            await this.releaseMutex(cachelock, datasetPath);
            return { id: lockValue, cnt: 1 };
        }

        if (lockValue && wid && lockValue.indexOf(wid) === -1) {
            await this.releaseMutex(cachelock, datasetPath);
            throw (Error.make(Error.Status.LOCKED,
                'The dataset ' + datasetPath + ' is locked for read with different ids'));

        }

        // ------------------------------------------------
        // [01] - unlocked dataset (no lock values)
        // ------------------------------------------------

        if (!lockValue) {

            // check if the dataset is invalid
            const datasetOut = (await DatasetDAO.get(journalClient, dataset))[0];
            if (datasetOut.sbit) { // write-locked (invalid file)
                await this.releaseMutex(cachelock, datasetPath);
                throw (Error.make(Error.Status.BAD_REQUEST,
                    'The dataset ' + datasetPath + ' is invalid and can only be deleted'));
            }

            // create a new read lock session and a new main read lock
            const lockID = idempotentReadLock || this.generateReadLockID();
            await Locker.setLock(datasetPath + '/' + lockID, lockID, this.EXP_READLOCK);
            await Locker.setLock(datasetPath, [lockID], this.EXP_READLOCK + this.TIME_5MIN);
            // when the session key expired i have to remove the wid/lockid from the main read lock
            this.redisSubscriptionClient.subscribe('__keyevent@0__:expired', datasetPath + '/' + lockID);

            await this.releaseMutex(cachelock, datasetPath);
            return { id: lockID, cnt: 1 };
        }

        // ------------------------------------------------
        // [03] - read locked (array of session id)
        // ------------------------------------------------

        // wid not present -> create a new read session and update the main read lock
        if (!wid) {
            const lockID = idempotentReadLock || this.generateReadLockID();
            (lockValue as string[]).push(lockID);
            await Locker.setLock(datasetPath + '/' + lockID, lockID, this.EXP_READLOCK);
            await Locker.setLock(datasetPath, lockValue, this.EXP_READLOCK + this.TIME_5MIN);
            await this.releaseMutex(cachelock, datasetPath);
            // when the session key expired i have to remove the wid/lockid from the main read lock
            this.redisSubscriptionClient.subscribe('__keyevent@0__:expired', datasetPath + '/' + lockID);
            return { id: lockID, cnt: (lockValue as string[]).length };
        }

        // wid present and found in read lock ids -> TRUSTED OPEN
        await this.releaseMutex(cachelock, datasetPath);
        return { id: wid, cnt: (lockValue as string[]).length };

    }

    public static async unlock(
        journalClient: IJournal | IJournalTransaction, dataset: DatasetModel,
        wid?: string, skipInvalid?: boolean): Promise<ILock> {

        const datasetPath = dataset.tenant + '/' + dataset.subproject + dataset.path + dataset.name;

        const cachelock = await this.acquireMutex(datasetPath);

        const lockValue = (await Locker.getLock(datasetPath));

        if (wid && lockValue) {

            if (this.isWriteLock(lockValue)) {
                // wrong close id
                if (lockValue !== wid) {
                    await this.releaseMutex(cachelock, datasetPath);
                    throw (Error.make(Error.Status.NOT_FOUND,
                        'The dataset ' + datasetPath + ' has been locked with different ID'));
                }

                // unlock in datastore
                const datasetUpdate = (await DatasetDAO.get(journalClient, dataset));
                if (datasetUpdate[0]) {
                    datasetUpdate[0].sbit = null;
                    datasetUpdate[0].sbit_count = 0;
                    await DatasetDAO.update(journalClient, datasetUpdate[0], datasetUpdate[1]);
                }

                // unlock in cache
                await Locker.del(datasetPath);
                await this.releaseMutex(cachelock, datasetPath);
                return { id: null, cnt: 0 };
            }
        }

        // ------------------------------------------------
        // [01] - global unlock
        // ------------------------------------------------

        if (!wid) {

            // if dataset is locked
            if (lockValue) {

                // if write locked remove lock from journalClient
                if (this.isWriteLock(lockValue)) {
                    const datasetTmp1 = (await DatasetDAO.get(journalClient, dataset));
                    if (datasetTmp1[0]) {
                        datasetTmp1[0].sbit = null;
                        await DatasetDAO.update(journalClient, datasetTmp1[0], datasetTmp1[1]);
                    }
                }

                // if read locked remove all session read locks
                if (!this.isWriteLock(lockValue)) {
                    for (const item of lockValue) {
                        await Locker.del(datasetPath + '/' + item);
                    }
                }

                // remove main lock from cache
                await Locker.del(datasetPath);
                await this.releaseMutex(cachelock, datasetPath);
                return { id: null, cnt: 0 };

            }

            // check if invalid
            if (!skipInvalid) {
                const datasetTmp2 = (await DatasetDAO.get(journalClient, dataset))[0];
                if (datasetTmp2 && datasetTmp2.sbit) {
                    await this.releaseMutex(cachelock, datasetPath);
                    throw (Error.make(Error.Status.NOT_FOUND,
                        'The dataset ' + datasetPath + ' is invalid and can only be deleted'));
                }
            }

            // dataset already unlocked
            await this.releaseMutex(cachelock, datasetPath);
            return { id: null, cnt: 0 };
        }

        // ------------------------------------------------
        // [02] - session unlock
        // ------------------------------------------------

        if (lockValue) {

            // read locked
            const lockindex = lockValue.indexOf(wid);

            // wrong close id
            if (lockindex === -1) {
                await this.releaseMutex(cachelock, datasetPath);
                throw (Error.make(Error.Status.NOT_FOUND,
                    'The dataset ' + datasetPath + ' has been locked with different IDs'));
            }

            // remove the session read lock and update the main read lock
            await Locker.del(datasetPath + '/' + wid);
            const lockValueNew = (lockValue as string[]).filter((el) => el !== wid);
            if (lockValueNew.length > 0) {
                const ttl = await Locker.getTTL(datasetPath);
                await Locker.setLock(datasetPath, lockValueNew, ttl);
            } else {
                await Locker.del(datasetPath);
            }
            await this.releaseMutex(cachelock, datasetPath);
            return {
                cnt: lockValueNew.length > 0 ? lockValueNew.length : 0,
                id: lockValueNew.length > 0 ? lockValueNew.join(',') : null,
            };
        }

        // ------------------------------------------------
        // [03] - unlocked
        // ------------------------------------------------

        // if dataset not lock in cache
        const datasetOut = (await DatasetDAO.get(journalClient, dataset))[0];

        // case 1: invalid dataset
        if (!skipInvalid) {
            if (datasetOut.sbit) {
                await this.releaseMutex(cachelock, datasetPath);
                throw (Error.make(Error.Status.NOT_FOUND,
                    'The dataset ' + datasetPath + ' is invalid and can only be deleted'));
            }
        }

        // case 2: dataset already unlocked
        await this.releaseMutex(cachelock, datasetPath);
        return { id: null, cnt: 0 };
    }

    public static async unlockReadLockSession(key: string, wid: string) {

        const cachelock = await this.acquireMutex(key);
        const lockValue = (await Locker.getLock(key));

        if (lockValue && !this.isWriteLock(lockValue)) {
            if (lockValue.indexOf(wid) > -1) {
                const lockValueNew = (lockValue as string[]).filter((el) => el !== wid);
                if (lockValueNew.length > 0) {
                    const ttl = await Locker.getTTL(key);
                    await Locker.setLock(key, lockValueNew, ttl);
                } else {
                    await Locker.del(key);
                }
            }
        }

        await this.releaseMutex(cachelock, key);

    }

    // We are acquiring a shared mutex on redis using redlock
    public static async acquireMutex(key: string): Promise<any> {

        try {
            const cachelock = await this.redlock.lock('locks:' + key, this.TTL);
            return cachelock;
        } catch (error) {
            throw Error.make(Error.Status.LOCKED, key + ' cannot be locked at the moment. Please try again shortly.');
        }

    }

    public static async releaseMutex(cachelock: any, key: string): Promise<void> {

        try {
            await this.redlock.unlock(cachelock);
        } catch (error) {
            throw Error.make(Error.Status.LOCKED, key + ' cannot be unlocked at the moment.');
        }
    }

}
