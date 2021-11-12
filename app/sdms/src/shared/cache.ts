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

import Redis from 'ioredis';
import { Config } from '../cloud';


let _cacheCore: CacheCore;

export class Cache<T = string> {

    private _defaultTTL = 3600; // default ttl in seconds -> 1h
    private _keyTag: string;

    constructor(keyTag?: string) {
        if (!_cacheCore) {
            initSharedCache();
        }
        this._keyTag = keyTag;
    }

    public async del(key: string): Promise<void> {
        return await _cacheCore._del(this.buildKey(key));
    }

    public async get(key: string): Promise<T> {
        return await _cacheCore._get(this.buildKey(key));
    }

    public async set(key: string, value: T, expireTime = this._defaultTTL): Promise<void> {
        await _cacheCore._set(this.buildKey(key), value, expireTime);
    }

    private buildKey(key: string): string {
        return this._keyTag ? (this._keyTag + ':' + key) : key;
    }

};

class CacheCore {

    private _redisClient: any;

    // retry strategy
    private static retryStrategy = (times: number) => {
        return Math.pow(2, times) + Math.random() * 100;
    };

    constructor() {
        const redis = Config.UTEST ? require('ioredis-mock') : undefined;
        this._redisClient =
            Config.UTEST ?
                new redis() :
                Config.DES_REDIS_INSTANCE_KEY ? Config.DES_REDIS_INSTANCE_TLS_DISABLE ?
                    new Redis({
                        host: Config.DES_REDIS_INSTANCE_ADDRESS,
                        port: Config.DES_REDIS_INSTANCE_PORT,
                        password: Config.DES_REDIS_INSTANCE_KEY,
                        retryStrategy: CacheCore.retryStrategy,
                        maxRetriesPerRequest: 5,
                        commandTimeout: 2000
                    }) :
                    new Redis({
                        host: Config.DES_REDIS_INSTANCE_ADDRESS,
                        port: Config.DES_REDIS_INSTANCE_PORT,
                        password: Config.DES_REDIS_INSTANCE_KEY,
                        tls: { servername: Config.DES_REDIS_INSTANCE_ADDRESS },
                        retryStrategy: CacheCore.retryStrategy,
                        maxRetriesPerRequest: 5,
                        commandTimeout: 2000
                    }) :
                    new Redis({
                        host: Config.DES_REDIS_INSTANCE_ADDRESS,
                        port: Config.DES_REDIS_INSTANCE_PORT,
                        retryStrategy: CacheCore.retryStrategy,
                        maxRetriesPerRequest: 5,
                        commandTimeout: 2000
                    });
    }

    public async _del(key: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this._redisClient.del(key, (err) => {
                err ? reject(err) : resolve();
            });
        });
    }

    public async _get(key: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this._redisClient.get(key, (err, res) => {
                err ? reject(err) : resolve(res ? JSON.parse(res).value : undefined);
            });
        });
    }

    public async _set(key: string, value: any, expireTime: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this._redisClient.setex(key, expireTime, JSON.stringify({ value }), (err) => {
                err ? reject(err) : resolve();
            });
        });
    }

}

export function initSharedCache() {
    if (!_cacheCore) {
        _cacheCore = new CacheCore();
    }
}
