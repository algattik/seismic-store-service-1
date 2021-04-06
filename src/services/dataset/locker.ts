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

import { Config } from '../../cloud';
import { Error, Utils } from '../../shared';

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
                Config.LOCKSMAP_REDIS_INSTANCE_TLS_DISABLE ?
                this.redisClient = redis.createClient({
                    host: Config.LOCKSMAP_REDIS_INSTANCE_ADDRESS,
                    port: Config.LOCKSMAP_REDIS_INSTANCE_PORT,
                    auth_pass: Config.LOCKSMAP_REDIS_INSTANCE_KEY
                }):
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
            this.redisSubscriptionClient.on('message', async (channel, key) => {
                if (channel === '__keyevent@0__:expired') {
                    await Locker.unlockReadLockSession(
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

    public static async getLock(key: string): Promise<string[] | string> {
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
    public static async createWriteLock(lockKey: string, idempotentWriteLock?: string): Promise<IWriteLockSession> {

        // const datasetPath = dataset.tenant + '/' + dataset.subproject + dataset.path + dataset.name;
        const cachelock = await this.acquireMutex(lockKey);
        const lockValue = (await Locker.getLock(lockKey));

        // idempotency requirement
        if(idempotentWriteLock && !idempotentWriteLock.startsWith('W')) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The provided idempotency key, for a write-lock operation, must start with the \'W\' letter'));
        }

        // if the lockValue is not present in the rediscache,
        // create the [KEY,VALUE] = [datasetPath, wid(sbit)] pair in the redis cache
        if (!lockValue) {
            const lockValueNew = idempotentWriteLock || this.generateWriteLockID();
            await this.set(lockKey, lockValueNew, this.EXP_WRITELOCK);
            return {idempotent: false, wid: lockValueNew, mutex: cachelock, key: lockKey};
        }

        // check if writelock already exist and match the input one (idempotent call)
        if(idempotentWriteLock && lockValue === idempotentWriteLock) {
            return {idempotent: true, wid: idempotentWriteLock, mutex: cachelock, key: lockKey};
        }

        throw (Error.make(Error.Status.LOCKED,
            lockKey + ' is ' + (this.isWriteLock(lockValue) ? 'write' : 'read') + ' locked'));
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
    public static async acquireWriteLock(lockKey: string, idempotentWriteLock: string, wid?: string): Promise<ILock> {

        // idempotency requirement
        if(idempotentWriteLock && !idempotentWriteLock.startsWith('W')) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The provided idempotency key, for a write-lock operation, must start with the \'W\' letter'));
        }

        const cachelock = await this.acquireMutex(lockKey);
        const lockValue = (await Locker.getLock(lockKey));

        // Already write locked but the idempotentWriteLock match the once in cache (idempotent call)
        if(lockValue && idempotentWriteLock && lockValue === idempotentWriteLock) {
            await this.releaseMutex(cachelock, lockKey);
            return {id: idempotentWriteLock, cnt: 0};
        }

        if (lockValue && wid && wid !== lockValue && this.isWriteLock(lockValue)) {
            await this.releaseMutex(cachelock, lockKey);
            throw (Error.make(Error.Status.LOCKED,
                lockKey + ' is locked for write with different id'));
        }

        // ------------------------------------------------
        // [01] - unlocked dataset (no lock values)
        // ------------------------------------------------

        if (!lockValue) {

            // create a new write lock and save in cache
            const lockID = idempotentWriteLock || this.generateWriteLockID();
            await Locker.set(lockKey, lockID, this.EXP_WRITELOCK);
            await this.releaseMutex(cachelock, lockKey);
            return { id: lockID, cnt: 1 };
        }

        // ------------------------------------------------
        // [02] - locked dataset
        // ------------------------------------------------

        // wid not specified - impossible lock
        if (!wid) {
            await this.releaseMutex(cachelock, lockKey);
            throw (Error.make(Error.Status.LOCKED,
                lockKey + ' is locked for ' + (this.isWriteLock(lockValue) ? 'write' : 'read')));
        }

        // write locked and different wid
        if (this.isWriteLock(lockValue) && wid !== lockValue) {
            await this.releaseMutex(cachelock, lockKey);
            throw (Error.make(Error.Status.LOCKED,
                lockKey + ' is locked for write with different id'));
        }

        if (!this.isWriteLock(lockValue) && lockValue.indexOf(wid) === -1) {
            await this.releaseMutex(cachelock, lockKey);
            throw (Error.make(Error.Status.LOCKED,
                lockKey + ' is locked for read widh different ids'));
        }

        // Trusted Open
        await this.releaseMutex(cachelock, lockKey);
        return { id: wid, cnt: this.isWriteLock(lockValue) ? 1 : (lockValue as string[]).length };

    }

    // create lock existing resource
    public static async acquireReadLock(lockKey: string, idempotentReadLock?: string, wid?: string): Promise<ILock> {

        // idempotency requirement
        if(idempotentReadLock && !idempotentReadLock.startsWith('R')) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The provided idempotency key, for a read-lock operation, must start with the \'R\' letter'));
        }

        // const datasetPath = dataset.tenant + '/' + dataset.subproject + dataset.path + dataset.name;
        const cachelock = await this.acquireMutex(lockKey);
        const lockValue = (await Locker.getLock(lockKey));

        if(lockValue && idempotentReadLock && !this.isWriteLock(lockValue) &&
            (lockValue as string[]).indexOf(idempotentReadLock) > -1) {
            await this.releaseMutex(cachelock, lockKey);
            return { id: idempotentReadLock, cnt: (lockValue as string[]).length };
        }

        if (this.isWriteLock(lockValue)) {

            // wid not specified -> error locked for write
            if (!wid) {
                await this.releaseMutex(cachelock, lockKey);
                throw (Error.make(Error.Status.LOCKED,
                    lockKey + ' is locked for write'));
            }

            // wid different -> error different wid
            if (wid !== lockValue) {
                await this.releaseMutex(cachelock, lockKey);
                throw (Error.make(Error.Status.LOCKED,
                    lockKey + ' is locked for write with different wid'));
            }

            // wid match -> TRUSTED OPEN
            await this.releaseMutex(cachelock, lockKey);
            return { id: lockValue, cnt: 1 };
        }

        if (lockValue && wid && lockValue.indexOf(wid) === -1) {
            await this.releaseMutex(cachelock, lockKey);
            throw (Error.make(Error.Status.LOCKED,
                lockKey + ' is locked for read with different ids'));
        }

        // ------------------------------------------------
        // [01] - unlocked dataset (no lock values)
        // ------------------------------------------------

        if (!lockValue) {

            // create a new read lock session and a new main read lock
            const lockID = idempotentReadLock || this.generateReadLockID();
            await Locker.setLock(lockKey + '/' + lockID, lockID, this.EXP_READLOCK);
            await Locker.setLock(lockKey, [lockID], this.EXP_READLOCK + this.TIME_5MIN);
            // when the session key expired i have to remove the wid/lockid from the main read lock
            this.redisSubscriptionClient.subscribe('__keyevent@0__:expired', lockKey + '/' + lockID);

            await this.releaseMutex(cachelock, lockKey);
            return { id: lockID, cnt: 1 };
        }

        // ------------------------------------------------
        // [03] - read locked (array of session id)
        // ------------------------------------------------

        // wid not present -> create a new read session and update the main read lock
        if (!wid) {
            const lockID = idempotentReadLock || this.generateReadLockID();
            (lockValue as string[]).push(lockID);
            await Locker.setLock(lockKey + '/' + lockID, lockID, this.EXP_READLOCK);
            await Locker.setLock(lockKey, lockValue, this.EXP_READLOCK + this.TIME_5MIN);
            await this.releaseMutex(cachelock, lockKey);
            // when the session key expired i have to remove the wid/lockid from the main read lock
            this.redisSubscriptionClient.subscribe('__keyevent@0__:expired', lockKey + '/' + lockID);
            return { id: lockID, cnt: (lockValue as string[]).length };
        }

        // wid present and found in read lock ids -> TRUSTED OPEN
        await this.releaseMutex(cachelock, lockKey);
        return { id: wid, cnt: (lockValue as string[]).length };

    }

    public static async unlock(lockKey: string, wid?: string): Promise<ILock> {

        const cachelock = await this.acquireMutex(lockKey);

        const lockValue = (await Locker.getLock(lockKey));

        if (wid && lockValue) {

            if (this.isWriteLock(lockValue)) {
                // wrong close id
                if (lockValue !== wid) {
                    await this.releaseMutex(cachelock, lockKey);
                    throw (Error.make(Error.Status.NOT_FOUND,
                        lockKey + ' has been locked with different ID'));
                }

                // unlock in cache
                await Locker.del(lockKey);
                await this.releaseMutex(cachelock, lockKey);
                return { id: null, cnt: 0 };
            }
        }

        // ------------------------------------------------
        // [01] - global unlock
        // ------------------------------------------------

        if (!wid) {

            // if dataset is locked
            if (lockValue) {

                // if read locked remove all session read locks
                if (!this.isWriteLock(lockValue)) {
                    for (const item of lockValue) {
                        await Locker.del(lockKey + '/' + item);
                    }
                }

                // remove main lock from cache
                await Locker.del(lockKey);
                await this.releaseMutex(cachelock, lockKey);
                return { id: null, cnt: 0 };

            }

            // dataset already unlocked
            await this.releaseMutex(cachelock, lockKey);
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
                await this.releaseMutex(cachelock, lockKey);
                throw (Error.make(Error.Status.NOT_FOUND,
                    lockKey + ' has been locked with different IDs'));
            }

            // remove the session read lock and update the main read lock
            await Locker.del(lockKey + '/' + wid);
            const lockValueNew = (lockValue as string[]).filter((el) => el !== wid);
            if (lockValueNew.length > 0) {
                const ttl = await Locker.getTTL(lockKey);
                await Locker.setLock(lockKey, lockValueNew, ttl);
            } else {
                await Locker.del(lockKey);
            }
            await this.releaseMutex(cachelock, lockKey);
            return {
                cnt: lockValueNew.length > 0 ? lockValueNew.length : 0,
                id: lockValueNew.length > 0 ? lockValueNew.join(',') : null,
            };
        }

        // ------------------------------------------------
        // [03] - unlocked
        // ------------------------------------------------

        // case 2: dataset already unlocked
        await this.releaseMutex(cachelock, lockKey);
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
