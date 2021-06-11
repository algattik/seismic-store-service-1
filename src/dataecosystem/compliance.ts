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
import { Error, Cache } from '../shared';

export class DESCompliance {

    private static _cache: Cache<boolean>;

    public static async isLegaTagValid(
        userToken: string, ltag: string, dataPartitionID: string, appkey: string): Promise<boolean> {

        if (!this._cache) {
            this._cache = new Cache<boolean>('ltag')
        }

        const res = await this._cache.get(ltag);
        if (res !== undefined && res) { return res };

        const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

        const options = {
            headers: {
                'Accept': 'application/json',
                'AppKey': appkey || Config.DES_SERVICE_APPKEY,
                'Content-Type': 'application/json'
            },
            json: { names: [ltag] },
            url: Config.DES_SERVICE_HOST_COMPLIANCE + dataecosystem.getComplianceBaseUrlPath() + '/legaltags:validate',
        };

        // tslint:disable-next-line: no-string-literal
        options.headers['Authorization'] = await dataecosystem.getAuthorizationHeader(userToken);
        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = dataPartitionID;

        const complianceLatency = new RecordLatency();

        try {

            const results = await request.post(options);
            complianceLatency.record(DESService.COMPLIANCE);
            await this._cache.set(ltag, results.invalidLegalTags.length === 0);
            return results.invalidLegalTags.length === 0;

        } catch (error) {

            complianceLatency.record(DESService.COMPLIANCE);
            recordError(error.statusCode, DESService.COMPLIANCE);
            throw (Error.makeForHTTPRequest(error, '[compliance-service]'));

        }

    }

}