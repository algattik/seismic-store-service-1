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

import redis from 'redis';

import { Config } from '../cloud';

export interface ICacheParameters {
    ADDRESS: string;
    PORT: number;
    KEY?: string
}

export class Cache<T=string> {

    private _redisClient: redis.RedisClient;
    private _defaultTTL = 3600; // default ttl in seconds -> 1h
    private _keyTag: string;

    constructor(connection: ICacheParameters, keyTag?: string) {

        this._keyTag = keyTag;

        this._redisClient =
            Config.UTEST ?
                require('redis-mock').createClient() :
                connection.KEY ?
                    redis.createClient({
                        host: connection.ADDRESS,
                        port: connection.PORT,
                        auth_pass: connection.KEY,
                        tls: {servername: connection.ADDRESS}}) :
                    redis.createClient({
                        host: connection.ADDRESS,
                        port: connection.PORT,
                    })
    }

    public async get(key: string): Promise<T> {
        return await this._get(key);
    }

    public async set(key: string, value: T, exptime=this._defaultTTL): Promise<void> {
        await this._set(key, value, exptime);
    }

    private buildKey(key: string): string {
        return this._keyTag ? (this._keyTag + ':' +  key) : key;
    }

    private async _get(key: string): Promise<T> {
        return new Promise((resolve, reject) => {
            this._redisClient.get(
                this.buildKey(key), (err, res) => {
                    err ? reject(err) : resolve(res ? JSON.parse(res).value : undefined); });
        });
    }

    private async _set(key: string, value: T, exptime:number): Promise<void> {
        return new Promise((resolve, reject) => {
            this._redisClient.setex(
                this.buildKey(key), exptime, JSON.stringify({value}), (err) => {
                    err ? reject(err) : resolve(); });
        });
    }

};
