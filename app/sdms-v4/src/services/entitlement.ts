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

import { Error, Utils } from '../shared';

import { Config } from '../cloud';
import axios from 'axios';

export interface EntitlementGroupMembers {
    name: string;
    description: string;
    email: string;
}

export class EntitlementCoreService {
    public static async getUserGroups(userToken: string, dataPartition: string): Promise<EntitlementGroupMembers[]> {
        const url = Config.CORE_SERVICE_HOST + Config.CORE_SERVICE_ENTITLEMENT_BASE_PATH + '/groups';

        const options: any = {
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
        };
        options.headers['Authorization'] = Utils.PreBearerToken(userToken);
        options.headers[Config.DATA_PARTITION_ID] = dataPartition;
        try {
            return (await axios.get(url, options)).data.groups;
        } catch (error) {
            throw Error.makeForHTTPRequest(error, '[entitlement-service]');
        }
    }
}
