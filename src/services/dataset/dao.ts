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

import { DatasetModel, PaginationModel } from '.';
import { IJournal, IJournalTransaction } from '../../cloud';
import { Config } from '../../cloud';
import { Utils } from '../../shared';
import { Locker } from './locker';

export class DatasetDAO {

    public static async register(journalClient: IJournal | IJournalTransaction, datasetEntity: any) {
        datasetEntity.data.ctag = Utils.makeID(16);
        journalClient.save(datasetEntity);
    }

    public static async get(
        journalClient: IJournal | IJournalTransaction,
        dataset: DatasetModel): Promise<[DatasetModel, any]> {
        let query = journalClient.createQuery(
            Config.SEISMIC_STORE_NS + '-' + dataset.tenant + '-' + dataset.subproject, Config.DATASETS_KIND);

        query = query.filter('name', dataset.name).filter('path', dataset.path);

        const [entities] = await journalClient.runQuery(query);

        return entities.length === 0 ?
            [undefined, undefined] :
            [await this.fixOldModel(
                entities[0] as DatasetModel,
                dataset.tenant, dataset.subproject), entities[0][journalClient.KEY]];
    }

    public static async getKey(
        journalClient: IJournal | IJournalTransaction, dataset: DatasetModel): Promise<[any]> {

        const query = journalClient.createQuery(
            Config.SEISMIC_STORE_NS + '-' + dataset.tenant + '-' +
            dataset.subproject, Config.DATASETS_KIND).select('__key__')
            .filter('name', dataset.name).filter('path', dataset.path);

        const [entities] = await journalClient.runQuery(query);

        return entities.length === 0 ? undefined : entities[0][journalClient.KEY];
    }

    public static async update(
        journalClient: IJournal | IJournalTransaction, dataset: DatasetModel, datasetKey: any) {

        dataset.ctag = Utils.makeID(16);
        await journalClient.save({ key: datasetKey, data: dataset });

    }

    public static async updateAll(
        journalClient: IJournal | IJournalTransaction, datasets: {data: DatasetModel, key: any}[]) {
        datasets.forEach(dataset => { dataset.data.ctag = Utils.makeID(16); });
        await journalClient.save(datasets);
    }

    public static async list(
        journalClient: IJournal | IJournalTransaction,
        dataset: DatasetModel): Promise<DatasetModel[]> {
        let query: any;
        if (dataset.gtags === undefined || dataset.gtags.length === 0) {
            query = journalClient.createQuery(
                Config.SEISMIC_STORE_NS + '-' + dataset.tenant + '-' + dataset.subproject, Config.DATASETS_KIND);
        } else {
            // filter based on gtags if parsed dataset model has gtags
            query = journalClient.createQuery(
                Config.SEISMIC_STORE_NS + '-' + dataset.tenant + '-' + dataset.subproject, Config.DATASETS_KIND);
            for (const gtag of dataset.gtags) {
                query = query.filter('gtags', journalClient.getQueryFilterSymbolContains(), gtag);
            }
        }

        let [entities] = await journalClient.runQuery(query);

        entities = (entities) as DatasetModel[];

        // Fix model for old entity
        for (let entity of entities) {
            entity = await this.fixOldModel(entity, dataset.tenant, dataset.subproject);
        }

        return entities;

    }

    public static async deleteAll(
        journalClient: IJournal | IJournalTransaction, tenantName: string, subprojectName: string) {

        const query = journalClient.createQuery(
            Config.SEISMIC_STORE_NS + '-' + tenantName + '-' + subprojectName, Config.DATASETS_KIND);

        const [entities] = await journalClient.runQuery(query);

        const todelete = [];
        for (const entity of entities) {
            todelete.push(journalClient.delete(entity[journalClient.KEY]));
        }

        await Promise.all(todelete);
    }

    public static async delete(journalClient: IJournal | IJournalTransaction, dataset: DatasetModel) {
        await journalClient.delete(dataset[journalClient.KEY]);
    }

    public static async paginatedListContent(
        journalClient: IJournal | IJournalTransaction, dataset: DatasetModel, pagination: PaginationModel):
        Promise<{ datasets: string[], nextPageCursor: string }> {

        const output = { datasets: [], nextPageCursor: null };

        // Retrieve the content datasets
        let query = journalClient.createQuery(
            Config.SEISMIC_STORE_NS + '-' + dataset.tenant + '-' + dataset.subproject, Config.DATASETS_KIND)
            .filter('path', dataset.path);
        if (pagination.cursor) {
            query = query.start(pagination.cursor);
        }
        if (pagination.limit) {
            query = query.limit(pagination.limit);
        }

        const [entitiesds, info] = await journalClient.runQuery(query);
        if (entitiesds.length !== 0) {
            output.datasets = entitiesds.map((item) => item.name);
            if (pagination) {
                output.nextPageCursor = info.endCursor;
            }
        }
        return output;
    }

    public static async listDatasets(
        journalClient: IJournal | IJournalTransaction,
        tenant: string, subproject: string, pagination?: PaginationModel):
        Promise<{ datasets: {data: DatasetModel, key: any}[], nextPageCursor: string }> {

            const output: any = { datasets: [], nextPageCursor: undefined };

            // Retrieve the content datasets
            let query = journalClient.createQuery(
                Config.SEISMIC_STORE_NS + '-' + tenant + '-' + subproject, Config.DATASETS_KIND);

            if (pagination && pagination.cursor) query = query.start(pagination.cursor);
            if (pagination && pagination.limit) query = query.limit(pagination.limit);

            const [entitiesds, info] = (await journalClient.runQuery(query)) as [DatasetModel[], {endCursor?: string}];

            if (entitiesds.length !== 0) {
                output.datasets = entitiesds.map((entity) => {
                    return {data: entity, key: entity[journalClient.KEY]};
                })
                if (pagination) {
                    output.nextPageCursor = info.endCursor;
                }
            }

            return output;
    }

    public static async listContent(
        journalClient: IJournal | IJournalTransaction, dataset: DatasetModel,
        wmode: string = Config.LS_MODE.ALL): Promise<{ datasets: string[], directories: string[] }> {

        const results = { datasets: [], directories: [] };

        // Retrieve the content datasets
        if (wmode === Config.LS_MODE.ALL || wmode === Config.LS_MODE.DATASETS) {
            const query = journalClient.createQuery(
                Config.SEISMIC_STORE_NS + '-' + dataset.tenant + '-' + dataset.subproject, Config.DATASETS_KIND)
                .filter('path', dataset.path);

            const [entitiesds] = await journalClient.runQuery(query);

            if (entitiesds.length !== 0) { results.datasets = entitiesds.map((item) => item.name); }
        }

        // Extract all the directories structure and get the subdirectories for the required directory
        if (wmode === Config.LS_MODE.ALL || wmode === Config.LS_MODE.DIRS) {
            const query = journalClient.createQuery(
                Config.SEISMIC_STORE_NS + '-' + dataset.tenant + '-' + dataset.subproject, Config.DATASETS_KIND)
                .select(['path']).groupBy('path').filter('path', '>', dataset.path).filter('path', '<', dataset.path + '\ufffd');

            const [entitieshy] = await journalClient.runQuery(query);
            results.directories = entitieshy.map((entity) => (entity.path as string).substr(dataset.path.length));
            results.directories = results.directories.map(
                (entity) => entity.substr(0, entity.indexOf('/'))).filter(
                    (elem, index, self) => index === self.indexOf(elem) );
        }

        return results;

    }


    // keep the returned metdata aligned with the original model also if internal implementation change
    public static async fixOldModel(
        entity: DatasetModel, tenantName: string, subprojectName: string): Promise<DatasetModel> {

        entity.subproject = entity.subproject || subprojectName;
        entity.tenant = entity.tenant || tenantName;
        entity.ctag = entity.ctag || '0000000000000000';
        entity.readonly = entity.readonly || false;
        const lockres = await Locker.getLockFromModel(entity);
        if (!lockres) { // unlocked
            entity.sbit = null;
            entity.sbit_count = 0;
        } else if (Locker.isWriteLock(lockres)) { // write lock
            entity.sbit = lockres as string;
            entity.sbit_count = 1;
        } else { // read lock
            entity.sbit = (lockres as string[]).join(',');
            entity.sbit_count = lockres.length;
        }
        return entity;
    }

}
