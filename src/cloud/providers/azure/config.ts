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
import { Keyvault } from './keyvault';
import { AzureInsightsLogger } from './insights';

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

    public async init(): Promise<void> {

        // set up secrets from Azure Keyvault
        AzureConfig.KEYVAULT_URL = process.env.KEYVAULT_URL;
        Config.checkRequiredConfig(AzureConfig.KEYVAULT_URL, 'KEYVAULT_URL');
        await Keyvault.loadSecrets(Keyvault.CreateSecretClient());

        // data ecosystem host url and appkey
        AzureConfig.DES_SERVICE_HOST_COMPLIANCE = process.env.DES_SERVICE_HOST
        AzureConfig.DES_SERVICE_HOST_ENTITLEMENT = process.env.DES_SERVICE_HOST
        AzureConfig.DES_SERVICE_HOST_STORAGE = process.env.DES_SERVICE_HOST
        AzureConfig.DES_SERVICE_HOST_PARTITION = process.env.DES_SERVICE_HOST
        AzureConfig.DES_ENTITLEMENT_DELETE_ENDPOINT_PATH = process.env.DES_ENTITLEMENT_DELETE_ENDPOINT_PATH;
        AzureConfig.DES_SERVICE_APPKEY = 'undefined'
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
        AzureConfig.LOCKSMAP_REDIS_INSTANCE_PORT = +process.env.REDIS_INSTANCE_PORT
        Config.checkRequiredConfig(AzureConfig.LOCKSMAP_REDIS_INSTANCE_PORT, 'REDIS_INSTANCE_PORT');

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
            JWKS_URL: process.env.JWKS_URL,
            JWT_EXCLUDE_PATHS: process.env.JWT_EXCLUDE_PATHS,
            JWT_AUDIENCE: process.env.JWT_AUDIENCE,
            JWT_ENABLE_FEATURE: process.env.JWT_ENABLE_FEATURE ? process.env.JWT_ENABLE_FEATURE === 'true' : false,
            TENANT_JOURNAL_ON_DATA_PARTITION: true,
            CORRELATION_ID: 'correlation-id',
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
        });

        // initialize app insight
        AzureInsightsLogger.initialize();

    }

}
