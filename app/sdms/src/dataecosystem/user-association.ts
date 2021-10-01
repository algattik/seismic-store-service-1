import request from 'request-promise';
import { AuthProviderFactory } from '../auth';
import { Config, DataEcosystemCoreFactory } from '../cloud';
import { DESService, RecordLatency } from '../metrics';
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
      const ccmUserAssocSvcLatency = new RecordLatency();

      try {
         const results = await request.get(options);
         ccmUserAssocSvcLatency.record(DESService.CCM_USER_ASSOCIATION_SVC);
         const userEmail = JSON.parse(results)['email'];

         await this._cache.set(cacheKey, userEmail);

         return userEmail;

      } catch (error) {
         ccmUserAssocSvcLatency.record(DESService.CCM_USER_ASSOCIATION_SVC);

         if (error && error.statusCode === 404 && error.message.includes('User not found')) {
            await this._cache.set(cacheKey, subId);
            return subId;
         }
         throw (Error.makeForHTTPRequest(error, '[ccm-user-association-service]'));
      }
   }
}