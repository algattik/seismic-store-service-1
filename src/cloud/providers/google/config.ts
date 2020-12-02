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
import fs from 'fs';

@ConfigFactory.register('google')
export class ConfigGoogle extends Config {

    // scopes
    public static GOOGLE_SCOPE_PLATFORM = 'https://www.googleapis.com/auth/cloud-platform';
    // [REVERT-DOWNSCOPE] remove this scope
    public static GOOGLE_SCOPE_FULLCONTROL = 'https://www.googleapis.com/auth/devstorage.full_control';

    // endpoints
    public static GOOGLE_EP_IAM = 'https://iam.googleapis.com/v1';
    public static GOOGLE_EP_OAUTH2 = 'https://www.googleapis.com/oauth2/v4';
    public static GOOGLE_EP_METADATA = 'http://metadata/computeMetadata/v1';
    public static GOOGLE_EP_ROBOT = 'https://www.googleapis.com/robot/v1';
    public static GOOGLE_EP_RESOURCES = 'https://cloudresourcemanager.googleapis.com/v1';

    // System Admin user agent email
    public static SYSTEM_ADMIN_EMAIL_SUFFIX: string;
    // System admin role (tenant provisioning required role)
    public static SEISTORE_SYSTEM_ADMIN_ROLE = 'seismic_store.system.admin';
    // DE target audiance for service to service communication
    public static DES_SERVICE_TARGET_AUDIENCE: string;

    // google cloud service project id
    public static SERVICE_CLOUD_PROJECT: string;

    // Service identities Configurations
    public static SERVICE_IDENTITY_KEY_FILENAME: string;
    public static SERVICE_IDENTITY_EMAIL: string;
    public static SERVICE_IDENTITY_PRIVATE_KEY: string;
    public static SERVICE_IDENTITY_PRIVATE_KEY_ID: string;

    // Apis base url path
    public static API_VERSION = 'v3';
    public static API_BASE_URL_PATH = '/api/' + ConfigGoogle.API_VERSION;

    // max len for a group name in DE
    public static DES_GROUP_CHAR_LIMIT = 64;

    public async init(): Promise<void> {

        // load system admins (a system admin can create a tenant)
        ConfigGoogle.SYSTEM_ADMIN_EMAIL_SUFFIX = process.env.SYSTEM_ADMIN_EMAIL_SUFFIX;
        Config.checkRequiredConfig(ConfigGoogle.SYSTEM_ADMIN_EMAIL_SUFFIX, 'SYSTEM_ADMIN_EMAIL_SUFFIX');

        // load des target audiance for service to service communication
        ConfigGoogle.DES_SERVICE_TARGET_AUDIENCE = process.env.SEISTORE_DES_TARGET_AUDIENCE;
        Config.checkRequiredConfig(ConfigGoogle.DES_SERVICE_TARGET_AUDIENCE, 'DES_SERVICE_TARGET_AUDIENCE');

        // set the google cloud service project id
        ConfigGoogle.SERVICE_CLOUD_PROJECT = process.env.SERVICE_CLOUD_PROJECT;
        Config.checkRequiredConfig(ConfigGoogle.SERVICE_CLOUD_PROJECT, 'SERVICE_CLOUD_PROJECT');

        // load service identity from credential file (for local dev - on cloud use work-load identities)
        ConfigGoogle.SERVICE_IDENTITY_KEY_FILENAME = process.env.SERVICE_IDENTITY_KEY_FILENAME;
        if (ConfigGoogle.SERVICE_IDENTITY_KEY_FILENAME) {
            const data = JSON.parse(fs.readFileSync(ConfigGoogle.SERVICE_IDENTITY_KEY_FILENAME).toString());
            ConfigGoogle.SERVICE_IDENTITY_EMAIL = data.client_email;
            ConfigGoogle.SERVICE_IDENTITY_PRIVATE_KEY = data.private_key;
            ConfigGoogle.SERVICE_IDENTITY_PRIVATE_KEY_ID = data.private_key_id;
        }

        await Config.initServiceConfiguration({
            SERVICE_ENV: process.env.APP_ENVIRONMENT_IDENTIFIER,
            SERVICE_PORT: +process.env.PORT || 5000,
            API_BASE_PATH: ConfigGoogle.API_BASE_URL_PATH,
            IMP_SERVICE_ACCOUNT_SIGNER: process.env.IMP_SERVICE_ACCOUNT_SIGNER,
            LOCKSMAP_REDIS_INSTANCE_ADDRESS: process.env.LOCKSMAP_REDIS_INSTANCE_ADDRESS,
            LOCKSMAP_REDIS_INSTANCE_PORT: +process.env.LOCKSMAP_REDIS_INSTANCE_PORT,
            LOCKSMAP_REDIS_INSTANCE_KEY: process.env.LOCKSMAP_REDIS_INSTANCE_KEY,
            DES_REDIS_INSTANCE_ADDRESS: process.env.DES_REDIS_INSTANCE_ADDRESS,
            DES_REDIS_INSTANCE_PORT: +process.env.DES_REDIS_INSTANCE_PORT,
            DES_REDIS_INSTANCE_KEY: process.env.DES_REDIS_INSTANCE_KEY,
            DES_SERVICE_HOST: process.env.SEISTORE_DES_HOST,
            DES_SERVICE_APPKEY: process.env.SEISTORE_DES_APPKEY,
            DES_GROUP_CHAR_LIMIT: ConfigGoogle.DES_GROUP_CHAR_LIMIT,
            JWKS_URL: process.env.JWKS_URL,
            JWT_EXCLUDE_PATHS: process.env.JWT_EXCLUDE_PATHS,
            JWT_AUDIENCE: process.env.JWT_AUDIENCE,
            JWT_ENABLE_FEATURE: process.env.JWT_ENABLE_FEATURE ? process.env.JWT_ENABLE_FEATURE === 'true' : false,
            TENANT_JOURNAL_ON_DATA_PARTITION: false,
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
                process.env.FEATURE_FLAG_STACKDRIVER_EXPORTER !== 'false' : true
        });

    }

}
