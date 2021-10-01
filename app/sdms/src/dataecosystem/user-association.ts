// ============================================================================
// Copyright 2017-2021, Schlumberger
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

import { AuthProviderFactory } from '../auth';
import { Config, DataEcosystemCoreFactory } from '../cloud';
import { Cache, Error } from '../shared';

export class DESUserAssociation {

   private static _cache: Cache<string>;

   // User association details cached for an hour
   private static _cacheEntryTTL = 3600;

   public static async convertSubIdToEmail(appkey: string, subId: string, dataPartitionID: string): Promise<string> {

      if (!this._cache) {
         this._cache = new Cache<string>('subid-to-email-mapping');
      }

      const cacheKey = subId;
      const cacheLookupResult = await this._cache.get(cacheKey);
      if (cacheLookupResult) {
         return cacheLookupResult;
      }

      const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

      const credential = await AuthProviderFactory
         .build(Config.SERVICE_AUTH_PROVIDER)
         .generateScopedAuthCredential([Config.CCM_TOKEN_SCOPE]);

      const options = {
         headers: {
            'Accept': 'application/json',
            'AppKey': appkey || Config.DES_SERVICE_APPKEY,
            'Authorization': 'Bearer ' + credential.access_token,
            'Content-Type': 'application/json'
         },
         url: Config.CCM_SERVICE_URL + '/' + dataecosystem.getUserAssociationSvcBaseUrlPath()
            + '/users/' + subId + '/information',
      };

      options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = dataPartitionID;

      try {
         const results = await request.get(options);
         const userEmail = JSON.parse(results)['email'];

         await this._cache.set(cacheKey, userEmail);

         return userEmail;

      } catch (error) {

         if (error && error.statusCode === 404 && error.message.includes('User not found')) {
            await this._cache.set(cacheKey, subId);
            return subId;
         }
         throw (Error.makeForHTTPRequest(error, '[ccm-user-association-service]'));
      }
   }
}