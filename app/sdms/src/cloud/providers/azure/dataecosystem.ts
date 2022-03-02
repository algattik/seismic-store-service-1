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

import request from 'request-promise';
import { Cache, Error } from '../../../shared';
import {
    AbstractDataEcosystemCore,
    DataEcosystemCoreFactory,
    IDESEntitlementGroupMembersModel
} from '../../dataecosystem';
import { AzureConfig } from './config';
import { AzureCredentials } from './credentials';
import { Keyvault } from './keyvault';



@DataEcosystemCoreFactory.register('azure')
export class AzureDataEcosystemServices extends AbstractDataEcosystemCore {
    private static _storageConfigs: Cache<string>;
    private static _cosmosConfigs: Cache<string>;

    public getUserAssociationSvcBaseUrlPath(): string { return 'userAssociation/v1'; }
    public getDataPartitionIDRestHeaderName(): string { return 'data-partition-id'; }
    public getEntitlementBaseUrlPath(): string { return '/api/entitlements/v2'; };
    public getComplianceBaseUrlPath(): string { return '/api/legal/v1'; };
    public getStorageBaseUrlPath(): string { return '/api/storage/v2'; };
    public getPolicySvcBaseUrlPath(): string { return '/api/policy/v1'; }

    public async getAuthorizationHeader(userToken: string): Promise<string> {
        return userToken.startsWith('Bearer') ? userToken : 'Bearer ' + userToken;
    }

    public fixGroupMembersResponse(groupMembers: any): IDESEntitlementGroupMembersModel {
        return groupMembers as IDESEntitlementGroupMembersModel;
    }

    public getUserAddBodyRequest(userEmail: string, role: string): { email: string, role: string; } | string[] {
        return { email: userEmail, role };
    }

    public tenantNameAndDataPartitionIDShouldMatch() {
        return true;
    }

    public static async getPartitionConfiguration(dataPartitionID: string): Promise<any> {
        const options = {
            headers: {
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + (await AzureCredentials.getAzureServicePrincipalAccessToken(
                    AzureConfig.SP_CLIENT_ID, AzureConfig.SP_CLIENT_SECRET,
                    AzureConfig.SP_TENANT_ID, AzureConfig.SP_APP_RESOURCE_ID)).access_token,
                'Content-Type': 'application/json'
            },
            url: AzureConfig.DES_SERVICE_HOST_PARTITION + '/api/partition/v1/partitions/' + dataPartitionID
        };
        try {
            return JSON.parse(await request.get(options));
        } catch (error) {
            throw (Error.makeForHTTPRequest(error));
        }
    }

    public static async getStorageResourceName(dataPartitionID: string): Promise<string> {

        if (!this._storageConfigs) {
            this._storageConfigs = new Cache<string>('storage');
        }

        const res = await this._storageConfigs.get(dataPartitionID);
        if (res !== undefined) { return res; };

        const dataPartitionConfigurations = await AzureDataEcosystemServices.getPartitionConfiguration(dataPartitionID);
        const storageConfigs = (dataPartitionConfigurations[Keyvault.DATA_PARTITION_STORAGE_ACCOUNT_NAME] as {
            sensitive: boolean, value: string;
        });
        if (storageConfigs.sensitive) {
            storageConfigs.value = (await Keyvault.CreateSecretClient().getSecret(storageConfigs.value)).value;
        }
        await this._storageConfigs.set(dataPartitionID, storageConfigs.value);
        return storageConfigs.value;
    }

    public static async getCosmosConnectionParams(
        dataPartitionID: string): Promise<{ endpoint: string, key: string; }> {

        if (!this._cosmosConfigs) {
            this._cosmosConfigs = new Cache<string>('cosmos');
        }

        const res = await this._cosmosConfigs.get(dataPartitionID);
        if (res !== undefined) { return JSON.parse(res); };

        const dataPartitionConfigurations = await AzureDataEcosystemServices.getPartitionConfiguration(dataPartitionID);

        const cosomsEndpointConfigs = (dataPartitionConfigurations[Keyvault.DATA_PARTITION_COSMOS_ENDPOINT] as {
            sensitive: boolean, value: string;
        });
        if (cosomsEndpointConfigs.sensitive) {
            cosomsEndpointConfigs.value = (await Keyvault.CreateSecretClient().getSecret(
                cosomsEndpointConfigs.value)).value;
        }

        const cosomsKeyConfigs = (dataPartitionConfigurations[Keyvault.DATA_PARTITION_COSMOS_PRIMARY_KEY] as {
            sensitive: boolean, value: string;
        });
        if (cosomsKeyConfigs.sensitive) {
            cosomsKeyConfigs.value = (await Keyvault.CreateSecretClient().getSecret(
                cosomsKeyConfigs.value)).value;
        }

        await this._cosmosConfigs.set(dataPartitionID, JSON.stringify({
            endpoint: cosomsEndpointConfigs.value, key: cosomsKeyConfigs.value
        }));

        // return storageConfigs.value;
        return { endpoint: cosomsEndpointConfigs.value, key: cosomsKeyConfigs.value };
    }

}
