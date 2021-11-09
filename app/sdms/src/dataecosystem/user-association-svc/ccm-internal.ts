import request from 'request-promise';
import { AuthProviderFactory } from '../../auth';
import { Config, DataEcosystemCoreFactory } from '../../cloud';
import { Cache, Error } from '../../shared';
import { AbstractUserAssociationSvcProvider, UserAssocationServiceFactory } from '../user-association';

// this impl is used when the USER_ASSOCIATION_SVC_PROVIDER env variable is set to decorator identifier ccm-internal
@UserAssocationServiceFactory.register('ccm-internal')
export class DESUserAssociation extends AbstractUserAssociationSvcProvider {

   private static _cache: Cache<string>;

   public async convertPrincipalIdentifierToEmail(principalIdentifier: string,
      dataPartitionID: string): Promise<string> {

      if (!DESUserAssociation._cache) {
         DESUserAssociation._cache = new Cache<string>('ccm-user-exchange');
      }

      const cacheKey = principalIdentifier;
      const cacheLookupResult = await DESUserAssociation._cache.get(cacheKey);
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
            'AppKey': Config.DES_SERVICE_APPKEY,
            'Authorization': 'Bearer ' + credential.access_token,
            'Content-Type': 'application/json'
         },
         url: Config.CCM_SERVICE_URL + '/' + dataecosystem.getUserAssociationSvcBaseUrlPath()
            + '/users/' + principalIdentifier + '/information',
      };

      options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = dataPartitionID;

      try {
         const results = await request.get(options);
         const userEmail = JSON.parse(results)['email'];

         await DESUserAssociation._cache.set(cacheKey, userEmail);

         return userEmail;

      } catch (error) {

         if (error && error.statusCode === 404 && error.message.includes('User not found')) {
            await DESUserAssociation._cache.set(cacheKey, principalIdentifier);
            return principalIdentifier;
         }
         throw (Error.makeForHTTPRequest(error, '[ccm-user-association-service]'));
      }
   }
}