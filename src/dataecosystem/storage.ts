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

import { Config, DataEcosystemCoreFactory } from '../cloud';
import { DESService, recordError, RecordLatency } from '../metrics';
import { Error } from '../shared';
import { DESUtils } from './utils';

export class DESStorage {

    public static async insertRecord(
        userToken: string, seismicMeta: any, esd: string, appkey: string): Promise<void> {

        const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

        const options = {
            headers: {
                'Accept': 'application/json',
                'AppKey': appkey || Config.DES_SERVICE_APPKEY,
                'Content-Type': 'application/json'
            },
            json: seismicMeta,
            url: Config.DES_SERVICE_HOST_STORAGE + dataecosystem.getStorageBaseUrlPath() + '/records',
        };

        // tslint:disable-next-line: no-string-literal
        options.headers['Authorization'] = await dataecosystem.getAuthorizationHeader(userToken);
        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = DESUtils.getDataPartitionID(esd);

        const storageLatency = new RecordLatency();

        try {

            await request.put(options);
            storageLatency.record(DESService.STORAGE);

        } catch (error) {

            storageLatency.record(DESService.STORAGE);
            recordError(error.statusCode, DESService.STORAGE);
            throw (Error.makeForHTTPRequest(error, '[storage-service]'));

        }

    }

    public static async deleteRecord(
        userToken: string, seismicUid: string, esd: string, appkey: string): Promise<void> {

        const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

        const options = {
            headers: {
                'Accept': 'application/json',
                'AppKey': appkey || Config.DES_SERVICE_APPKEY,
                'Content-Type': 'application/json',
            },
            url: Config.DES_SERVICE_HOST_STORAGE + dataecosystem.getStorageBaseUrlPath() + '/records/' + seismicUid + ':delete',
        };

        // tslint:disable-next-line: no-string-literal
        options.headers['Authorization'] = await dataecosystem.getAuthorizationHeader(userToken);
        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = DESUtils.getDataPartitionID(esd);

        const storageLatency = new RecordLatency();

        try {

            await request.post(options);
            storageLatency.record(DESService.STORAGE);

        } catch (error) {

            storageLatency.record(DESService.STORAGE);
            recordError(error.statusCode, DESService.STORAGE);
            throw (Error.makeForHTTPRequest(error, '[storage-service]'));

        }
    }


    public static async getRecord(
        userToken: string, seismicUid: string, esd: string, appkey: string): Promise<any> {

        const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

        const options = {
            headers: {
                'Accept': 'application/json',
                'AppKey': appkey || Config.DES_SERVICE_APPKEY,
            },
            url: Config.DES_SERVICE_HOST_STORAGE + dataecosystem.getStorageBaseUrlPath() + '/records/' + seismicUid,
        };

        // tslint:disable-next-line: no-string-literal
        options.headers['Authorization'] = await dataecosystem.getAuthorizationHeader(userToken);
        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = DESUtils.getDataPartitionID(esd);

        const storageLatency = new RecordLatency();

        try {

            const results = await request.get(options);
            storageLatency.record(DESService.STORAGE);
            return JSON.parse(results)

        } catch (error) {

            storageLatency.record(DESService.STORAGE);
            recordError(error.statusCode, DESService.STORAGE);
            throw (Error.makeForHTTPRequest(error, '[storage-service]'));

        }


    }



}
