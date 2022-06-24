// ============================================================================
// Copyright 2017-2022, Schlumberger
//
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// Distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// Limitations under the License.
// ============================================================================

import { Error, Utils, getInMemoryCacheInstance } from '../shared';

import { Config } from '../cloud';
import axios from 'axios';

export class ComplianceCoreService {
    public static async isLegalTagValid(userToken: string, legalTag: string, dataPartition: string): Promise<boolean> {
        const cache = getInMemoryCacheInstance();

        const res = cache.get<boolean>(legalTag);
        if (res !== undefined && res) {
            return res;
        }

        const url = Config.CORE_SERVICE_HOST + Config.CORE_SERVICE_COMPLIANCE_BASE_PATH + '/legaltags:validate';
        const options: any = {
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
        };

        const json = JSON.stringify({ names: [legalTag] });
        options.headers['Authorization'] = Utils.PreBearerToken(userToken);
        options.headers[Config.DATA_PARTITION_ID] = dataPartition;

        try {
            const results: any = (await axios.post(url, json, options)).data;
            cache.set<boolean>(legalTag, results.invalidLegalTags.length === 0, 60);
            return results.invalidLegalTags.length === 0;
        } catch (error) {
            throw Error.makeForHTTPRequest(error, '[compliance-service]');
        }
    }
}
