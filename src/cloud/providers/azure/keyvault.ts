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

import { SecretClient } from '@azure/keyvault-secrets';
import { AzureConfig } from './config';
import { AzureCredentials } from './credentials';

export class Keyvault {
    public static AI_INSTRUMENTATION_KEY = 'appinsights-key';
    public static REDIS_HOST = 'redis-hostname';
    public static REDIS_KEY = 'redis-password';
    public static SP_TENANT_ID = 'app-dev-sp-tenant-id';
    public static SP_CLIENT_ID = 'app-dev-sp-username';
    public static SP_CLIENT_SECRET = 'app-dev-sp-password';
    public static SP_APP_RESOURCE_ID = 'aad-client-id';
    public static DATA_PARTITION_STORAGE_ACCOUNT_NAME = 'sdms-storage-account-name';
    public static DATA_PARTITION_COSMOS_ENDPOINT = 'cosmos-endpoint';
    public static DATA_PARTITION_COSMOS_PRIMARY_KEY = 'cosmos-primary-key';

    // to restore when the impersonation token for azure will be implemented
    // public static IMP_SERVICE_ACCOUNT_SIGNER = 'imp-service-account-signer';

    public static CreateSecretClient(): SecretClient {
        const credential = AzureCredentials.getCredential();
        const vaultName = AzureConfig.KEYVAULT_URL;
        const url = `https://${vaultName}.vault.azure.net`;
        const client = new SecretClient(url, credential);
        return client;
    }

    public static async loadSecrets(client: SecretClient) {

        // DefaultAzureCredential expects the following three environment variables:
        // - AZURE_TENANT_ID: The tenant ID in Azure Active Directory
        // - AZURE_CLIENT_ID: The application (client) ID registered in the AAD tenant
        // - AZURE_CLIENT_SECRET: The client secret for the registered application

        // insight instrumentation key
        AzureConfig.AI_INSTRUMENTATION_KEY = (await client.getSecret(this.AI_INSTRUMENTATION_KEY)).value;

        // locksmap redis cache secret
        AzureConfig.LOCKSMAP_REDIS_INSTANCE_KEY = (await client.getSecret(this.REDIS_KEY)).value;
        AzureConfig.LOCKSMAP_REDIS_INSTANCE_ADDRESS = (await client.getSecret(this.REDIS_HOST)).value;

        // service principal secrets
        AzureConfig.SP_TENANT_ID =
            AzureConfig.SP_TENANT_ID = (await client.getSecret(this.SP_TENANT_ID)).value;
        AzureConfig.SP_CLIENT_ID =
            AzureConfig.SP_CLIENT_ID = (await client.getSecret(this.SP_CLIENT_ID)).value;
        AzureConfig.SP_CLIENT_SECRET =
            AzureConfig.SP_CLIENT_SECRET = (await client.getSecret(this.SP_CLIENT_SECRET)).value;
        AzureConfig.SP_APP_RESOURCE_ID =
            AzureConfig.SP_APP_RESOURCE_ID = (await client.getSecret(this.SP_APP_RESOURCE_ID)).value;;

    }
}