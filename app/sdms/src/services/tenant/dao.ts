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

import { TenantModel } from '.';
import { Config, JournalFactoryServiceClient } from '../../cloud';
import { Cache, Error } from '../../shared';

export class TenantDAO {

    // private static _cache = new Cache<TenantModel>('tenant');

    // get tenant metadata (throw if not exist)
    public static async get(tenantName: string): Promise<TenantModel> {

        // const res = await this._cache.get(tenantName);
        // if (res !== undefined && res) { return res; };

        const serviceClient = JournalFactoryServiceClient.get(
            Config.TENANT_JOURNAL_ON_DATA_PARTITION ? {
                name: tenantName,
                esd: tenantName + '.domain.com',
                default_acls: tenantName,
                gcpid: tenantName
            } : undefined);

        const key = serviceClient.createKey({
            namespace: Config.ORGANIZATION_NS,
            path: [Config.TENANTS_KIND, tenantName],
        });

        let [entity] = await serviceClient.get(key);

        if (!entity) {
            throw (Error.make(Error.Status.NOT_FOUND, 'The tenant project ' + tenantName + ' does not exist'));
        }

        // Fix for old entities that did not have a name in the metadata
        entity = entity as TenantModel;
        if (!entity.name) { entity.name = tenantName; }

        // await this._cache.set(entity.name, entity);

        return entity;

    }

    // get all tenant metadata (throw if not exist)
    public static async getAll(): Promise<TenantModel[]> {

        if (Config.TENANT_JOURNAL_ON_DATA_PARTITION) {
            throw (Error.make(Error.Status.NOT_IMPLEMENTED, 'The invoked method is not implemented for ' +
                'solutions having tenant\' journal deployed on client resources'));
        }

        const serviceClient = JournalFactoryServiceClient.get();

        const query = serviceClient.createQuery(Config.ORGANIZATION_NS, Config.TENANTS_KIND);

        const results = (await serviceClient.runQuery(query))[0];

        // Fix for old entities that did not have a name in the metadata
        for (const item of results) {
            if (!item.name) { item.name = item[serviceClient.KEY].name; }
        }
        return results;
    }

    // register tenant metadata
    public static async register(tenant: TenantModel): Promise<void> {

        const serviceClient = JournalFactoryServiceClient.get(
            Config.TENANT_JOURNAL_ON_DATA_PARTITION ? tenant : undefined);

        const entityKey = serviceClient.createKey({
            namespace: Config.ORGANIZATION_NS,
            path: [Config.TENANTS_KIND, tenant.name],
        });

        await serviceClient.save({ data: tenant, key: entityKey });

        // await this._cache.set(tenant.name, tenant);

    }

    // delete subproject metadata
    public static async delete(tenantName: string): Promise<void> {

        const serviceClient = JournalFactoryServiceClient.get(
            Config.TENANT_JOURNAL_ON_DATA_PARTITION ? {
                name: tenantName,
                esd: tenantName + '.domain.com',
                default_acls: tenantName,
                gcpid: tenantName
            } : undefined);

        await serviceClient.delete(serviceClient.createKey({
            namespace: Config.ORGANIZATION_NS,
            path: [Config.TENANTS_KIND, tenantName],
        }));
        // await this._cache.del(tenantName);
    }

    // check if a tenant exist
    public static async exist(tenant: TenantModel): Promise<boolean> {

        // const res = await this._cache.get(tenant.name);
        // if (res !== undefined && res) { return true; };

        const serviceClient = JournalFactoryServiceClient.get(
            Config.TENANT_JOURNAL_ON_DATA_PARTITION ? tenant : undefined);

        const [entity] = await serviceClient.get(serviceClient.createKey({
            namespace: Config.ORGANIZATION_NS,
            path: [Config.TENANTS_KIND, tenant.name],
        }));

        // if (entity) {
            // await this._cache.set(entity.name, entity);
        // }

        return entity !== undefined;
    }

}
