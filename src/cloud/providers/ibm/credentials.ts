/* Licensed Materials - Property of IBM              */
/* (c) Copyright IBM Corp. 2020. All Rights Reserved.*/


import KcAdminClient from 'keycloak-admin';
import { AbstractCredentials, CredentialsFactory, IAccessTokenModel } from '../../credentials';
import { Config } from '../../config';
import { IbmConfig } from './config';
import { logger } from './logger';
import { IBMSTShelper } from './stshelper';
import { DatastoreDAO } from './datastore';




@CredentialsFactory.register('ibm')
export class Credentials extends AbstractCredentials {
    private serviceAccountIdToken: string;
    private serviceAccountIdTokenExpiresIn = 0;
    private serviceAccountAccessToken: IAccessTokenModel;
    private serviceAccountAccessTokenExpiresIn = 0;


    private ibmSTSHelper = new IBMSTShelper();

    async getBucketFolder(tenant: string, subproject: string): Promise<string> {


        const ibmDatastoreHelper = new DatastoreDAO(Config.TENANT_JOURNAL_ON_DATA_PARTITION ? {
            name: tenant,
            esd: tenant + '.domain.com',
            default_acls: tenant,
            gcpid: tenant
        } : undefined);

        const spkey = ibmDatastoreHelper.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + tenant,
            path: [Config.SUBPROJECTS_KIND, subproject],
        });

        logger.debug('Printing Key', spkey)
        const [spentity] = await ibmDatastoreHelper.get(spkey);
        logger.debug('Printing Key', spentity.gcs_bucket)
        const bucket = spentity.gcs_bucket;
        return bucket;


    }

    public async getStorageCredentials(

        tenant: string, subproject: string,
        bucket: string, readonly: boolean, _partition: string): Promise<IAccessTokenModel> {

        const expDuration = IbmConfig.COS_TEMP_CRED_EXPITY;
        let roleArn = '';
        let credentials = '';

        let flagUpload = true;
        const keypath = await this.getBucketFolder(tenant, subproject);
        // this is temporary. Once dataset is being passed to get gcs token,
        // this can start getting folder from gcs url along with bucket
        const s3bucket = keypath;


        if (readonly) { // readOnly True

            roleArn = 'arn:123:456:789:1234';
            flagUpload = false;
        } else   // readOnly False
        {
            roleArn = 'arn:123:456:789:1234';
            flagUpload = true;
        }

        credentials = await this.ibmSTSHelper.getCredentials(s3bucket, keypath, roleArn, flagUpload, expDuration);
        const result = {
            access_token: credentials,
            expires_in: 7200,
            token_type: 'Bearer',
        };
        return result;


    }


    public async getServiceCredentials(): Promise<string> {
        logger.info('In Credentials.getServiceCredentials.');
        const adminClient = new KcAdminClient();
        adminClient.setConfig(
            {
                baseUrl: IbmConfig.KEYCLOAK_BASEURL,
                realmName: IbmConfig.KEYCLOAK_REALM,
                requestConfig: {
                    // `url` is the server URL that will be used for the request
                    url: IbmConfig.KEYCLOAK_URL_TOKEN,
                    // `method` is the request method to be used when making the request
                    method: 'post', // default
                },
            }
        );
        const crdntls = {
            username: IbmConfig.KEYCLOAK_USERNAME,
            password: IbmConfig.KEYCLOAK_PASSWORD,
            grantType: IbmConfig.KEYCLOAK_GRANTTYPE,
            clientId: IbmConfig.KEYCLOAK_CLIENTID,
            clientSecret: IbmConfig.KEYCLOAK_CLIENTSECRET,
        };

        logger.info('Authenticating.');
        try {
            await adminClient.auth(crdntls);
        } catch (error) {
            logger.error('Authentication failure.');
            throw new Error(error);
        }

        logger.info('Getting token by calling getAccessToken.');
        const token = adminClient.getAccessToken();
        logger.debug('Token - ' + token);
        logger.info('Returning from Credentials.getStorageCredentials.');
        return token;
    }

    public async getServiceAccountAccessToken(): Promise<IAccessTokenModel> {
        // throw new Error("getServiceAccountAccessToken. Method not implemented.");
        /*
        const now = Math.floor(Date.now() / 1000);
        if (this.serviceAccountAccessToken && this.serviceAccountAccessTokenExpiresIn > now) {
            return this.serviceAccountAccessToken;
        }

        if (!Config.ONCLOUD) {
            const jwt = jwttoken.sign({
                aud: Credentials.GOOGLE_EP_OAUTH2 + '/token',
                exp: (now + 3600),
                iat: now,
                iss: Config.DEVOPS_SERVICE_ACCOUNT_EMAIL,
                scope: Credentials.GOOGLE_SCOPE_PLATFORM,
            }, Config.DEVOPS_PRIVATE_KEY, {
                header: {
                    alg: 'RS256',
                    kid: Config.DEVOPS_PRIVATE_KEY_ID,
                    typ: 'JWT',
                },
            });

            this.serviceAccountAccessToken = await this.signJWT(jwt) as IAccessTokenModel;
            this.serviceAccountAccessTokenExpiresIn =
                Math.floor(Date.now() / 1000) + this.serviceAccountAccessToken.expires_in - KExpiresMargin;
            return this.serviceAccountAccessToken;
        }

        const options = {
            headers: { 'Metadata-Flavor': 'Google' },
            url: Credentials.GOOGLE_EP_METADATA + '/instance/service-accounts/default/token',
        };

        try {
            this.serviceAccountAccessToken = JSON.parse(await request.get(options));
            this.serviceAccountAccessTokenExpiresIn =
                Math.floor(Date.now() / 1000) + this.serviceAccountAccessToken.expires_in - KExpiresMargin;
            return this.serviceAccountAccessToken;
        } catch (error) {
            throw new Error(error);
            //throw (Error.makeForHTTPRequest(error));
        }*/
        throw new Error('Checking if user is sysadmin. Work in progress.');
    }

    public getServiceAccountEmail(): Promise<string> {
        logger.info('In Credentials.getServiceAccountEmail. Method not implemented.');
        throw new Error('getServiceAccountEmail. Method not implemented.');
    }

    public getIAMResourceUrl(serviceSigner: string): string {
        /// not implemented
        logger.info('In Credentials.getIAMResourceUrl. Method not implemented.');
        return '';
    }

    public getAudienceForImpCredentials(): string {
        logger.info('In Credentials.getAudienceForImpCredentials.');
        return IbmConfig.KEYCLOAK_BASEURL + IbmConfig.KEYCLOAK_URL_TOKEN;
        /// throw new Error("getAudienceForImpCredentials. Method not implemented.");
    }

    public getPublicKeyCertificatesUrl(): string {
        logger.info('In Credentials.getPublicKeyCertificatesUrl. Method not implemented.');
        throw new Error('getPublicKeyCertificatesUrl. Method not implemented.');
    }

}