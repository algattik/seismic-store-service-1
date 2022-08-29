import request from 'request-promise';
import { AuthProviderFactory } from '../../auth';
import { Config, DataEcosystemCoreFactory } from '../../cloud';
import { Error, getInMemoryCacheInstance } from '../../shared';
import { AbstractUserAssociationSvcProvider, UserAssociationServiceFactory } from '../user-association';

// this impl is used when the USER_ASSOCIATION_SVC_PROVIDER env variable is set to decorator identifier ccm-internal
@UserAssociationServiceFactory.register('ccm-internal')
export class DESUserAssociation extends AbstractUserAssociationSvcProvider {

   public async convertPrincipalIdentifierToUserInfo(principalIdentifier: string,
      dataPartitionID: string): Promise<string> {

      const cache = getInMemoryCacheInstance();
      const cacheKey = 'ccm-' + principalIdentifier;
      const cacheLookupResult = cache.get<string>(cacheKey);
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

         cache.set<string>(cacheKey, userEmail, 3600);

         return userEmail;

      } catch (error) {

         if (error && error.statusCode === 404 && error.message.includes('User not found')) {
            cache.set<string>(cacheKey, principalIdentifier, 3600);
            return principalIdentifier;
         }
         throw (Error.makeForHTTPRequest(error, '[ccm-user-association-service]'));
      }
   }
}