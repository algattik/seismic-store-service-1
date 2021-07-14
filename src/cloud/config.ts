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

import { CloudFactory } from './cloud';

export interface IConfig {
    init(): Promise<void>;
}

export interface ConfigModel {
    SERVICE_ENV: string;
    SERVICE_PORT: number;
    IMP_SERVICE_ACCOUNT_SIGNER: string;
    LOCKSMAP_REDIS_INSTANCE_ADDRESS: string;
    LOCKSMAP_REDIS_INSTANCE_PORT: number;
    LOCKSMAP_REDIS_INSTANCE_KEY?: string;
    LOCKSMAP_REDIS_INSTANCE_TLS_DISABLE?: boolean;
    DES_REDIS_INSTANCE_ADDRESS: string;
    DES_REDIS_INSTANCE_PORT: number;
    DES_REDIS_INSTANCE_KEY?: string;
    DES_REDIS_INSTANCE_TLS_DISABLE?: boolean;
    DES_SERVICE_HOST_ENTITLEMENT: string;
    DES_SERVICE_HOST_COMPLIANCE: string;
    DES_SERVICE_HOST_STORAGE: string;
    DES_SERVICE_HOST_PARTITION: string;
    DES_ENTITLEMENT_DELETE_ENDPOINT_PATH?: string;
    DES_SERVICE_APPKEY: string;
    DES_GROUP_CHAR_LIMIT: number;
    JWKS_URL: string;
    JWT_EXCLUDE_PATHS: string;
    JWT_AUDIENCE: string;
    JWT_ENABLE_FEATURE: boolean;
    API_BASE_PATH: string;
    TENANT_JOURNAL_ON_DATA_PARTITION: boolean;
    SSL_ENABLED?: boolean;
    SSL_KEY_PATH?: string;
    SSL_CERT_PATH?: string;
    ENFORCE_SCHEMA_BY_KEY?: boolean;
    CORRELATION_ID?: string;
    SERVICE_AUTH_PROVIDER?: string;
    SERVICE_AUTH_PROVIDER_CREDENTIAL?: string;
    FEATURE_FLAG_AUTHORIZATION: boolean;
    FEATURE_FLAG_LEGALTAG: boolean;
    FEATURE_FLAG_SEISMICMETA_STORAGE: boolean;
    FEATURE_FLAG_IMPTOKEN: boolean;
    FEATURE_FLAG_STORAGE_CREDENTIALS: boolean;
    FEATURE_FLAG_TRACE: boolean;
    FEATURE_FLAG_LOGGING: boolean;
    FEATURE_FLAG_STACKDRIVER_EXPORTER: boolean;
}

export abstract class Config implements IConfig {

    // Unit Test activation flag
    public static UTEST: string;

    // Service base configurations
    public static SERVICE_ENV: string;
    public static SERVICE_PORT: number;
    public static CLOUDPROVIDER: string;

    // API base path
    public static API_BASE_PATH: string;

    // Seismic Store path prefix
    public static SDPATHPREFIX = 'sd://';

    // Namespace and Kind catalog definitions
    public static ORGANIZATION_NS = 'organization';
    public static SEISMIC_STORE_NS = 'seismic-store';
    public static TENANTS_KIND = 'tenants';
    public static SUBPROJECTS_KIND = 'subprojects';
    public static DATASETS_KIND = 'datasets';
    public static SEISMICMETA_KIND = 'seismicmeta';
    public static APPS_KIND = 'apps';
    public static IMPERSONATION_TOKEN_SIGNATURE_KIND = 'imptoken_signatures'

    // Listing modes
    public static LS_MODE = { ALL: 'all', DATASETS: 'datasets', DIRS: 'dirs' };

    // Impersonation Token Service Account [this is the account used to sign the impersonation token]
    public static IMP_SERVICE_ACCOUNT_SIGNER: string;

    // Redis cache for lock
    public static LOCKSMAP_REDIS_INSTANCE_ADDRESS: string;
    public static LOCKSMAP_REDIS_INSTANCE_PORT: number;
    public static LOCKSMAP_REDIS_INSTANCE_KEY: string;
    public static LOCKSMAP_REDIS_INSTANCE_TLS_DISABLE: boolean;

    // Redis cache for DataEcosystem results
    public static DES_REDIS_INSTANCE_ADDRESS: string;
    public static DES_REDIS_INSTANCE_PORT: number;
    public static DES_REDIS_INSTANCE_KEY: string;
    public static DES_REDIS_INSTANCE_TLS_DISABLE: boolean;

    // DataEcosystem Configuration
    public static DES_SERVICE_HOST_ENTITLEMENT: string;
    public static DES_SERVICE_HOST_COMPLIANCE: string;
    public static DES_SERVICE_HOST_STORAGE: string;
    public static DES_SERVICE_HOST_PARTITION: string;
    public static DES_ENTITLEMENT_DELETE_ENDPOINT_PATH: string;
    public static DES_SERVICE_APPKEY: string;
    public static DES_GROUP_CHAR_LIMIT: number;
    public static DE_FORWARD_APPKEY = Symbol('seismic-dms-fw-caller-appkey');

    // JWT Validation
    public static JWKS_URL: string;
    public static JWT_EXCLUDE_PATHS: string;
    public static JWT_AUDIENCE: string;
    public static JWT_ENABLE_FEATURE: boolean;

    // To set in the provider specific configurations based on implementation
    public static TENANT_JOURNAL_ON_DATA_PARTITION = false;

    // Feature Flags
    public static FEATURE_FLAG_AUTHORIZATION = true;
    public static FEATURE_FLAG_LEGALTAG = true;
    public static FEATURE_FLAG_SEISMICMETA_STORAGE = true;
    public static FEATURE_FLAG_IMPTOKEN = true;
    public static FEATURE_FLAG_STORAGE_CREDENTIALS = true;
    public static FEATURE_FLAG_TRACE = true;
    public static FEATURE_FLAG_LOGGING = true;
    public static FEATURE_FLAG_STACKDRIVER_EXPORTER = true;

    // DataGroups prefix
    public static DATAGROUPS_PREFIX = 'data.sdms';
    public static SERVICEGROUPS_PREFIX = 'service.seistore';

    // Server SSL
    public static SSL_ENABLED: boolean;
    public static SSL_KEY_PATH: string;
    public static SSL_CERT_PATH: string;

    public static ENFORCE_SCHEMA_BY_KEY: boolean;

    // The Key name of the header correlation ID
    public static CORRELATION_ID: string;

    // service auth provider and identity (optional)
    // The CSP identity is used to interact with CSP solutions like db/storage/log/etc...
    // This account, if set, can be used to sign an impersonation token credential.
    // This account, if set, can be used to perform Auth Operations like credentials exchange.
    // Introduced because different auth providers can be used on a CSP deployment
    // The decoding policy is defined in the src/auth/auth.ts and implemented in src/auth/providers/*
    public static SERVICE_AUTH_PROVIDER_CREDENTIAL: string;
    // This id build the auth provider in the abstraction implemented in src/auth/providers/*
    public static SERVICE_AUTH_PROVIDER: string;

    // WriteLock Skip
    // This is an open issue to discuss.
    // Checking the write lock is the correct behavior and this variable should be set to "false".
    // The current client libraries are not capable to send the locking session id on mutable operations.
    // As results imposing this check will break the functionalities of many current running applications.
    // The C++ SDK mainly requires a fix on how behave on mutable calls.
    public static SKIP_WRITE_LOCK_CHECK_ON_MUTABLE_OPERATIONS = true;


    // Access policy of a subproject can either be uniform or dataset
    public static UNIFORM_ACCESS_POLICY = 'uniform';
    public static DATASET_ACCESS_POLICY = 'dataset';

    public static setCloudProvider(cloudProvider: string) {
        Config.CLOUDPROVIDER = cloudProvider;
        if (Config.CLOUDPROVIDER === undefined) {
            throw (new Error(
                'The \"CLOUDPROVIDER\" environment variable has not been set (required to start the server)'));
        }
    }

    protected static async initServiceConfiguration(model: ConfigModel): Promise<void> {

        Config.SERVICE_ENV = model.SERVICE_ENV;
        Config.SERVICE_PORT = model.SERVICE_PORT;

        Config.IMP_SERVICE_ACCOUNT_SIGNER = model.IMP_SERVICE_ACCOUNT_SIGNER;

        Config.LOCKSMAP_REDIS_INSTANCE_ADDRESS = model.LOCKSMAP_REDIS_INSTANCE_ADDRESS;
        Config.LOCKSMAP_REDIS_INSTANCE_PORT = model.LOCKSMAP_REDIS_INSTANCE_PORT;
        Config.LOCKSMAP_REDIS_INSTANCE_KEY = model.LOCKSMAP_REDIS_INSTANCE_KEY;
        Config.LOCKSMAP_REDIS_INSTANCE_TLS_DISABLE = model.LOCKSMAP_REDIS_INSTANCE_TLS_DISABLE || false;

        Config.DES_REDIS_INSTANCE_ADDRESS =
            model.DES_REDIS_INSTANCE_ADDRESS || model.LOCKSMAP_REDIS_INSTANCE_ADDRESS;
        Config.DES_REDIS_INSTANCE_PORT =
            model.DES_REDIS_INSTANCE_PORT || model.LOCKSMAP_REDIS_INSTANCE_PORT;
        Config.DES_REDIS_INSTANCE_KEY =
            model.DES_REDIS_INSTANCE_KEY || model.LOCKSMAP_REDIS_INSTANCE_KEY;
        Config.DES_REDIS_INSTANCE_TLS_DISABLE =
            model.DES_REDIS_INSTANCE_TLS_DISABLE || model.LOCKSMAP_REDIS_INSTANCE_TLS_DISABLE;

        Config.FEATURE_FLAG_AUTHORIZATION = model.FEATURE_FLAG_AUTHORIZATION;
        Config.FEATURE_FLAG_LEGALTAG = model.FEATURE_FLAG_LEGALTAG;
        Config.FEATURE_FLAG_SEISMICMETA_STORAGE = model.FEATURE_FLAG_SEISMICMETA_STORAGE;
        Config.FEATURE_FLAG_IMPTOKEN = model.FEATURE_FLAG_IMPTOKEN;
        Config.FEATURE_FLAG_STORAGE_CREDENTIALS = model.FEATURE_FLAG_STORAGE_CREDENTIALS;
        Config.FEATURE_FLAG_TRACE = model.FEATURE_FLAG_TRACE;
        Config.FEATURE_FLAG_LOGGING = model.FEATURE_FLAG_LOGGING;
        Config.FEATURE_FLAG_STACKDRIVER_EXPORTER = model.FEATURE_FLAG_STACKDRIVER_EXPORTER;

        Config.DES_SERVICE_HOST_ENTITLEMENT = model.DES_SERVICE_HOST_ENTITLEMENT;
        Config.DES_SERVICE_HOST_COMPLIANCE = model.DES_SERVICE_HOST_COMPLIANCE;
        Config.DES_SERVICE_HOST_STORAGE = model.DES_SERVICE_HOST_STORAGE;
        Config.DES_SERVICE_HOST_PARTITION = model.DES_SERVICE_HOST_PARTITION;
        Config.DES_ENTITLEMENT_DELETE_ENDPOINT_PATH = model.DES_ENTITLEMENT_DELETE_ENDPOINT_PATH || '/groups/data/';
        Config.DES_SERVICE_APPKEY = model.DES_SERVICE_APPKEY;
        Config.DES_GROUP_CHAR_LIMIT = model.DES_GROUP_CHAR_LIMIT;

        Config.JWKS_URL = model.JWKS_URL;
        Config.JWT_EXCLUDE_PATHS = model.JWT_EXCLUDE_PATHS;
        Config.JWT_AUDIENCE = model.JWT_AUDIENCE;
        Config.JWT_ENABLE_FEATURE = model.JWT_ENABLE_FEATURE;

        Config.API_BASE_PATH = model.API_BASE_PATH;

        Config.TENANT_JOURNAL_ON_DATA_PARTITION = model.TENANT_JOURNAL_ON_DATA_PARTITION || false;

        Config.SSL_ENABLED = model.SSL_ENABLED || false;
        Config.SSL_KEY_PATH = model.SSL_KEY_PATH;
        Config.SSL_CERT_PATH = model.SSL_CERT_PATH;

        Config.ENFORCE_SCHEMA_BY_KEY = model.ENFORCE_SCHEMA_BY_KEY || false;

        Config.CORRELATION_ID = model.CORRELATION_ID || undefined;

        Config.SERVICE_AUTH_PROVIDER = model.SERVICE_AUTH_PROVIDER || 'generic';
        Config.SERVICE_AUTH_PROVIDER_CREDENTIAL = model.SERVICE_AUTH_PROVIDER_CREDENTIAL || undefined;

        Config.checkRequiredConfig(Config.CLOUDPROVIDER, 'CLOUDPROVIDER');
        Config.checkRequiredConfig(Config.SERVICE_ENV, 'SERVICE_ENV');
        Config.checkRequiredConfig(Config.IMP_SERVICE_ACCOUNT_SIGNER, 'IMP_SERVICE_ACCOUNT_SIGNER');
        Config.checkRequiredConfig(Config.DES_SERVICE_HOST_ENTITLEMENT, 'DES_SERVICE_HOST_ENTITLEMENT');
        Config.checkRequiredConfig(Config.DES_SERVICE_HOST_COMPLIANCE, 'DES_SERVICE_HOST_COMPLIANCE');
        Config.checkRequiredConfig(Config.DES_SERVICE_HOST_STORAGE, 'DES_SERVICE_HOST_STORAGE');
        Config.checkRequiredConfig(Config.DES_SERVICE_HOST_PARTITION, 'DES_SERVICE_HOST_PARTITION');
        Config.checkRequiredConfig(Config.DES_ENTITLEMENT_DELETE_ENDPOINT_PATH, 'DES_ENTITLEMENT_DELETE_ENDPOINT_PATH');
        Config.checkRequiredConfig(Config.DES_SERVICE_APPKEY, 'DES_SERVICE_APPKEY');

        // JWT validation
        if (Config.JWT_ENABLE_FEATURE) {
            Config.checkRequiredConfig(Config.JWKS_URL, 'JWKS_URL');
            Config.checkRequiredConfig(Config.JWT_EXCLUDE_PATHS, 'JWT_EXCLUDE_PATHS');
            Config.checkRequiredConfig(Config.JWT_AUDIENCE, 'JWT_AUDIENCE');
        }

        // auto generated configurations
        Config.ORGANIZATION_NS = Config.ORGANIZATION_NS + '-' + Config.SERVICE_ENV;
        Config.SEISMIC_STORE_NS = Config.SEISMIC_STORE_NS + '-' + Config.SERVICE_ENV;

    }

    // must be implemented in the provider
    public abstract init(): Promise<void>;

    protected static checkRequiredConfig(config: any, name: string) {
        if (config === undefined || (typeof (config) === 'number' && isNaN(config))) {
            throw (new Error('missing configuration: ' + name));
        }
    }

}

export class ConfigFactory extends CloudFactory {
    public static build(providerLabel: string, args: { [key: string]: any; } = {}): IConfig {
        return CloudFactory.build(providerLabel, Config, args) as IConfig;
    }
}

// Set the Utest flag correctly as soon as the config class get loaded
Config.UTEST = process.env.UTEST;
