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

import { Config, ConfigFactory } from '../../config';
import { LoggerFactory } from '../../logger';
import { AzureInsightsLogger } from './insights';
import { Keyvault } from './keyvault';

@ConfigFactory.register('azure')
export class AzureConfig extends Config {

    // Vars to hold service principal configurations
    public static SP_TENANT_ID: string;
    public static SP_CLIENT_ID: string;
    public static SP_CLIENT_SECRET: string;
    public static SP_APP_RESOURCE_ID: string;

    // Instrumentation key
    public static AI_INSTRUMENTATION_KEY: string;

    // keyvault id
    public static KEYVAULT_URL: string;

    // Apis base url path
    public static API_VERSION = 'v3';
    public static API_BASE_URL_PATH = '/seistore-svc/api/' + AzureConfig.API_VERSION;

    // max len for a group name in DE
    public static DES_GROUP_CHAR_LIMIT = 256;

    // cosmo db max throughput settings
    public static COSMO_MAX_THROUGHPUT: number;

    public async init(): Promise<void> {


        try {

            // set up secrets from Azure Keyvault
            AzureConfig.KEYVAULT_URL = process.env.KEYVAULT_URL;
            Config.checkRequiredConfig(AzureConfig.KEYVAULT_URL, 'KEYVAULT_URL');
            await Keyvault.loadSecrets(Keyvault.CreateSecretClient());

            // data ecosystem host url and appkey
            AzureConfig.DES_SERVICE_HOST_COMPLIANCE = process.env.DES_SERVICE_HOST;
            AzureConfig.DES_SERVICE_HOST_ENTITLEMENT = process.env.DES_SERVICE_HOST;
            AzureConfig.DES_SERVICE_HOST_STORAGE = process.env.DES_SERVICE_HOST;
            AzureConfig.DES_SERVICE_HOST_PARTITION = process.env.DES_SERVICE_HOST;
            AzureConfig.DES_ENTITLEMENT_DELETE_ENDPOINT_PATH = process.env.DES_ENTITLEMENT_DELETE_ENDPOINT_PATH;
            AzureConfig.DES_SERVICE_APPKEY = process.env.SEISTORE_DES_APPKEY || 'undefined';
            AzureConfig.CCM_SERVICE_URL = process.env.CCM_SERVICE_URL;
            AzureConfig.CCM_TOKEN_SCOPE = process.env.CCM_TOKEN_SCOPE;
            Config.checkRequiredConfig(AzureConfig.DES_SERVICE_HOST_COMPLIANCE, 'DES_SERVICE_HOST');
            Config.checkRequiredConfig(AzureConfig.DES_SERVICE_HOST_ENTITLEMENT, 'DES_SERVICE_HOST');
            Config.checkRequiredConfig(AzureConfig.DES_SERVICE_HOST_STORAGE, 'DES_SERVICE_HOST');
            Config.checkRequiredConfig(AzureConfig.DES_SERVICE_HOST_PARTITION, 'DES_SERVICE_HOST');
            Config.checkRequiredConfig(AzureConfig.DES_SERVICE_APPKEY, 'DES_SERVICE_APPKEY');

            // the email of the service identity used to sign an impersonation token
            // to restore when the impersonation token for azure will be implemented
            // (await client.getSecret(this.IMP_SERVICE_ACCOUNT_SIGNER)).value;
            AzureConfig.IMP_SERVICE_ACCOUNT_SIGNER = 'not@implemented,tester-carbon.slbservice.com';

            // redis cache port for locks (the port as env variable)
            AzureConfig.LOCKSMAP_REDIS_INSTANCE_PORT = +process.env.REDIS_INSTANCE_PORT;
            Config.checkRequiredConfig(AzureConfig.LOCKSMAP_REDIS_INSTANCE_PORT, 'REDIS_INSTANCE_PORT');

            // set the auth provider
            AzureConfig.SERVICE_AUTH_PROVIDER = process.env.SERVICE_AUTH_PROVIDER;
            AzureConfig.SERVICE_AUTH_PROVIDER_CREDENTIAL = // If not set as secret try to load from envs
                AzureConfig.SERVICE_AUTH_PROVIDER_CREDENTIAL || process.env.SERVICE_AUTH_PROVIDER_CREDENTIAL;

            // cosmo throughput settings
            AzureConfig.COSMO_MAX_THROUGHPUT = +process.env.COSMO_MAX_THROUGHPUT || 25000;

            // init generic configurations
            await Config.initServiceConfiguration({
                SERVICE_ENV: process.env.APP_ENVIRONMENT_IDENTIFIER,
                SERVICE_PORT: +process.env.PORT || 5000,
                API_BASE_PATH: AzureConfig.API_BASE_URL_PATH,
                IMP_SERVICE_ACCOUNT_SIGNER: AzureConfig.IMP_SERVICE_ACCOUNT_SIGNER,
                LOCKSMAP_REDIS_INSTANCE_ADDRESS: AzureConfig.LOCKSMAP_REDIS_INSTANCE_ADDRESS,
                LOCKSMAP_REDIS_INSTANCE_PORT: AzureConfig.LOCKSMAP_REDIS_INSTANCE_PORT,
                LOCKSMAP_REDIS_INSTANCE_KEY: AzureConfig.LOCKSMAP_REDIS_INSTANCE_KEY,
                DES_REDIS_INSTANCE_ADDRESS: AzureConfig.DES_REDIS_INSTANCE_ADDRESS,
                DES_REDIS_INSTANCE_PORT: AzureConfig.DES_REDIS_INSTANCE_PORT,
                DES_REDIS_INSTANCE_KEY: AzureConfig.DES_REDIS_INSTANCE_KEY,
                DES_SERVICE_HOST_COMPLIANCE: AzureConfig.DES_SERVICE_HOST_COMPLIANCE,
                DES_SERVICE_HOST_ENTITLEMENT: AzureConfig.DES_SERVICE_HOST_ENTITLEMENT,
                DES_SERVICE_HOST_STORAGE: AzureConfig.DES_SERVICE_HOST_STORAGE,
                DES_SERVICE_HOST_PARTITION: AzureConfig.DES_SERVICE_HOST_PARTITION,
                DES_ENTITLEMENT_DELETE_ENDPOINT_PATH: AzureConfig.DES_ENTITLEMENT_DELETE_ENDPOINT_PATH,
                DES_SERVICE_APPKEY: AzureConfig.DES_SERVICE_APPKEY,
                DES_GROUP_CHAR_LIMIT: AzureConfig.DES_GROUP_CHAR_LIMIT,
                SERVICE_AUTH_PROVIDER: AzureConfig.SERVICE_AUTH_PROVIDER,
                SERVICE_AUTH_PROVIDER_CREDENTIAL: AzureConfig.SERVICE_AUTH_PROVIDER_CREDENTIAL,
                JWKS_URL: process.env.JWKS_URL,
                JWT_EXCLUDE_PATHS: process.env.JWT_EXCLUDE_PATHS,
                JWT_AUDIENCE: process.env.JWT_AUDIENCE,
                JWT_ENABLE_FEATURE: process.env.JWT_ENABLE_FEATURE ? process.env.JWT_ENABLE_FEATURE === 'true' : false,
                TENANT_JOURNAL_ON_DATA_PARTITION: true,
                CORRELATION_ID: 'correlation-id',
                ENABLE_SDMS_ID_AUDIENCE_CHECK: process.env.ENABLE_SDMS_ID_AUDIENCE_CHECK !== undefined ?
                    process.env.ENABLE_SDMS_ID_AUDIENCE_CHECK === 'true' : false,
                ENABLE_DE_TOKEN_EXCHANGE: process.env.ENABLE_DE_TOKEN_EXCHANGE !== undefined ?
                    process.env.ENABLE_DE_TOKEN_EXCHANGE === 'true' : false,
                DES_TARGET_AUDIENCE: process.env.DES_TARGET_AUDIENCE,
                FEATURE_FLAG_AUTHORIZATION: process.env.FEATURE_FLAG_AUTHORIZATION !== undefined ?
                    process.env.FEATURE_FLAG_AUTHORIZATION !== 'false' : true,
                FEATURE_FLAG_LEGALTAG: process.env.FEATURE_FLAG_LEGALTAG !== undefined ?
                    process.env.FEATURE_FLAG_LEGALTAG !== 'false' : true,
                FEATURE_FLAG_SEISMICMETA_STORAGE: process.env.FEATURE_FLAG_SEISMICMETA_STORAGE !== undefined ?
                    process.env.FEATURE_FLAG_SEISMICMETA_STORAGE !== 'false' : true,
                FEATURE_FLAG_IMPTOKEN: process.env.FEATURE_FLAG_IMPTOKEN !== undefined ?
                    process.env.FEATURE_FLAG_IMPTOKEN !== 'false' : true,
                FEATURE_FLAG_STORAGE_CREDENTIALS: process.env.FEATURE_FLAG_STORAGE_CREDENTIALS !== undefined ?
                    process.env.FEATURE_FLAG_STORAGE_CREDENTIALS !== 'false' : true,
                FEATURE_FLAG_TRACE: process.env.FEATURE_FLAG_TRACE !== undefined ?
                    process.env.FEATURE_FLAG_TRACE !== 'false' : true,
                FEATURE_FLAG_LOGGING: process.env.FEATURE_FLAG_LOGGING !== undefined ?
                    process.env.FEATURE_FLAG_LOGGING !== 'false' : true,
                FEATURE_FLAG_STACKDRIVER_EXPORTER: process.env.FEATURE_FLAG_STACKDRIVER_EXPORTER !== undefined ?
                    process.env.FEATURE_FLAG_STACKDRIVER_EXPORTER !== 'false' : true,
                FEATURE_FLAG_CCM_INTERACTION: process.env.FEATURE_FLAG_CCM_INTERACTION ?
                    process.env.FEATURE_FLAG_CCM_INTERACTION === 'true' : false,
                CCM_SERVICE_URL: AzureConfig.CCM_SERVICE_URL,
                CCM_TOKEN_SCOPE: AzureConfig.CCM_TOKEN_SCOPE,
                CALLER_FORWARD_HEADERS: process.env.CALLER_FORWARD_HEADERS,
                USER_ID_CLAIM_FOR_SDMS: process.env.USER_ID_CLAIM_FOR_SDMS || 'subid',
                USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC: process.env.USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC || 'email',
                USER_ASSOCIATION_SVC_PROVIDER: process.env.USER_ASSOCIATION_SVC_PROVIDER || 'ccm-internal',
                SDMS_PREFIX: process.env.SDMS_PREFIX ? process.env.SDMS_PREFIX : '/seistore-svc/api/v3'
            });

            // initialize app insight
            AzureInsightsLogger.initialize();
        } catch (error) {
            LoggerFactory.build(Config.CLOUDPROVIDER).error('Unable to initialize configuration for azure cloud provider ' + error);
            throw error;
        }

    }

}
