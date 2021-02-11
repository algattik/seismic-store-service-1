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

import {
    AbstractDataEcosystemCore,
    DataEcosystemCoreFactory,
    IDESEntitlementGroupMembersModel
} from '../../dataecosystem';
import { AzureCredentials } from './credentials';

import { AzureConfig } from './config';
import { Error, Cache } from '../../../shared';
import { Keyvault } from './keyvault';

import request from 'request-promise'

@DataEcosystemCoreFactory.register('azure')
export class AzureDataEcosystemServices extends AbstractDataEcosystemCore {

    private static _storageConfigs: Cache<string>
    private static _cosmosConfigs: Cache<string>

    public getDataPartitionIDRestHeaderName(): string { return 'data-partition-id'; }
    public getEntitlementBaseUrlPath(): string { return '/entitlements/v1'; };
    public getComplianceBaseUrlPath(): string { return '/api/legal/v1'; };
    public getStorageBaseUrlPath(): string { return '/api/storage/v2'; };

    public async getAuthorizationHeader(userToken: string): Promise<string> {
        return userToken.startsWith('Bearer') ? userToken : 'Bearer ' + userToken;
    }

    public fixGroupMembersResponse(groupMembers: any[]): IDESEntitlementGroupMembersModel {

        // temporary fix for DE azure
        if (groupMembers && groupMembers.length === 0) {
            throw {
                error: {
                    message: 'NOT_FOUND'
                },
                statusCode: 404,
                name: 'StatusCodeError'
            }
        }

        // temporary fix as roles support is currently not implemented in DE azure
        // if the group has only 1 member it must be the OWNER
        if (groupMembers && groupMembers.length === 1) {
            return {
                members: [{
                    email: groupMembers[0],
                    role: 'OWNER'
                }],
                cursor: undefined
            } as IDESEntitlementGroupMembersModel;
        }

        const members = [];
        for (const member of groupMembers as any[]) {
            members.push({
                email: member,
                role: 'MEMBER'
            });
        }
        return {
            members,
            cursor: undefined
        } as IDESEntitlementGroupMembersModel;
    }

    public getUserAddBodyRequest(userEmail: string, role: string): { email: string, role: string } | string[] {
        return [userEmail];
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

    public static async getStorageAccountName(dataPartitionID: string): Promise<string> {

        if (!this._storageConfigs) {
            this._storageConfigs = new Cache<string>({
                ADDRESS: AzureConfig.DES_REDIS_INSTANCE_ADDRESS,
                PORT: AzureConfig.DES_REDIS_INSTANCE_PORT,
                KEY: AzureConfig.DES_REDIS_INSTANCE_KEY,
                DISABLE_TLS: AzureConfig.DES_REDIS_INSTANCE_TLS_DISABLE,
            }, 'storage')
        }

        const res = await this._storageConfigs.get(dataPartitionID);
        if (res !== undefined) { return res };

        const dataPartitionConfigurations = await AzureDataEcosystemServices.getPartitionConfiguration(dataPartitionID);
        const storageConfigs = (dataPartitionConfigurations[Keyvault.DATA_PARTITION_STORAGE_ACCOUNT_NAME] as {
            sensitive: boolean, value: string
        });
        if (storageConfigs.sensitive) {
            storageConfigs.value = (await Keyvault.CreateSecretClient().getSecret(storageConfigs.value)).value;
        }
        await this._storageConfigs.set(dataPartitionID, storageConfigs.value);
        return storageConfigs.value;
    }

    public static async getCosmosConnectionParams(
        dataPartitionID: string): Promise<{ endpoint: string, key: string }> {

        if (!this._cosmosConfigs) {
            this._cosmosConfigs = new Cache<string>({
                ADDRESS: AzureConfig.DES_REDIS_INSTANCE_ADDRESS,
                PORT: AzureConfig.DES_REDIS_INSTANCE_PORT,
                KEY: AzureConfig.DES_REDIS_INSTANCE_KEY,
                DISABLE_TLS: AzureConfig.DES_REDIS_INSTANCE_TLS_DISABLE,
            }, 'cosmos')
        }

        const res = await this._cosmosConfigs.get(dataPartitionID);
        if (res !== undefined) { return JSON.parse(res); };

        const dataPartitionConfigurations = await AzureDataEcosystemServices.getPartitionConfiguration(dataPartitionID);

        const cosomsEndpointConfigs = (dataPartitionConfigurations[Keyvault.DATA_PARTITION_COSMOS_ENDPOINT] as {
            sensitive: boolean, value: string
        });
        if (cosomsEndpointConfigs.sensitive) {
            cosomsEndpointConfigs.value = (await Keyvault.CreateSecretClient().getSecret(
                cosomsEndpointConfigs.value)).value;
        }

        const cosomsKeyConfigs = (dataPartitionConfigurations[Keyvault.DATA_PARTITION_COSMOS_PRIMARY_KEY] as {
            sensitive: boolean, value: string
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