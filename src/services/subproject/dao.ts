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

import { SubprojectGroups, SubProjectModel } from '.';
import { Config, IJournal, IJournalTransaction } from '../../cloud';
import { Error } from '../../shared';
import { TenantDAO } from '../tenant';

export class SubProjectDAO {

    // register a new subproject under a given Tenant Project (existance check must be done externally)
    public static async register(journalClient: IJournal | IJournalTransaction, subprojectEntity: any) {
        await journalClient.save(subprojectEntity);
    }

    // get subproject metadata (throw if not exist)
    public static async get(
        journalClient: IJournal | IJournalTransaction,
        tenantName: string, subprojectName: string, key: any): Promise<SubProjectModel> {

        let [entity] = await journalClient.get(key);

        if (!entity) {
            throw (Error.make(Error.Status.NOT_FOUND, 'The subproject ' + subprojectName +
                ' does not exist in the tenant project ' + tenantName));
        }

        // Fix for old entities that did not have a name in the metadata
        entity = entity as SubProjectModel;
        if (!entity.name) { entity.name = subprojectName; }
        if (!entity.tenant) { entity.tenant = tenantName; }


        // Fix entities with no acls
        if (!entity.acls) {

            // const tenant = await TenantDAO.get(tenantName)

            // const acls = {
            //     'admins': [],
            //     'viewers': []
            // }

            // acls.admins.push(SubprojectGroups.oldAdminGroupName(entity.tenant, entity.name) + '@' + tenant.esd)
            // acls.admins.push(SubprojectGroups.oldEditorGroupName(entity.tenant, entity.name) + '@' + tenant.esd)
            // acls.viewers.push(SubprojectGroups.oldViewerGroupName(entity.tenant, entity.name) + '@' + tenant.esd)

            entity.acls = await this.constructServiceGroupACLs(entity, tenantName)
        }

        return entity;

    }

    // get subproject metadata (throw if not exist)
    public static async delete(journalClient: IJournal | IJournalTransaction, key: any) {
        await journalClient.delete(key);
    }

    // get all tenant metadata (throw if not exist)
    public static async getAll(journalClient: IJournal, tenantName: string): Promise<SubProjectModel[]> {

        const query = journalClient.createQuery(Config.SEISMIC_STORE_NS + '-' + tenantName, Config.SUBPROJECTS_KIND);

        const entities = (await journalClient.runQuery(query))[0];

        // Fix for old entities that did not have a name in the metadata
        for (const entity of entities) {
            if (!entity.name) { entity.name = entity[journalClient.KEY].name; } // was previously journalClient.KEY
            if (!entity.tenant) { entity.tenant = tenantName; }
        }
        return entities;
    }

    // get subproject metadata
    public static async list(
        journalClient: IJournal | IJournalTransaction,
        tenantName: string): Promise<SubProjectModel[]> {

        const query = journalClient.createQuery(Config.SEISMIC_STORE_NS + '-' + tenantName, Config.SUBPROJECTS_KIND);

        let [entities] = await journalClient.runQuery(query);

        if (entities.length > 0) {
            // Fix for old entities that did not have a name in the metadata
            entities = entities as SubProjectModel[];
            for (const entity of entities) {
                if (!entity.name) { entity.name = entity[journalClient.KEY].name; }
                if (!entity.tenant) { entity.tenant = tenantName; }

                if (!entity.acls) {
                    entity.acls = await this.constructServiceGroupACLs(entity, tenantName)
                }

            }
        }
        return entities;
    }

    // check if a subproject exists
    public static async exist(journalClient: IJournal | IJournalTransaction, key: any): Promise<boolean> {

        const [entity] = await journalClient.get(key);

        return entity !== undefined;
    }

    public static async constructServiceGroupACLs(entity, tenantName: string) {

        const tenant = await TenantDAO.get(tenantName)

        const acls = {
            'admins': [],
            'viewers': []
        }

        acls.admins.push(SubprojectGroups.oldAdminGroupName(entity.tenant, entity.name) + '@' + tenant.esd)
        acls.admins.push(SubprojectGroups.oldEditorGroupName(entity.tenant, entity.name) + '@' + tenant.esd)
        acls.viewers.push(SubprojectGroups.oldViewerGroupName(entity.tenant, entity.name) + '@' + tenant.esd)

        return acls

    }

}
