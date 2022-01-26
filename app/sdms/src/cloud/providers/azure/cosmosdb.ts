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

import { CosmosClient, Container, FeedResponse } from '@azure/cosmos';
import {
    AbstractJournal, AbstractJournalTransaction,
    IJournalQueryModel, IJournalTransaction, JournalFactory } from '../../journal';
import { TenantModel } from '../../../services/tenant';
import { AzureDataEcosystemServices } from './dataecosystem';
import { AzureConfig } from './config';
import { Config } from '../..';

@JournalFactory.register('azure')
export class AzureCosmosDbDAO extends AbstractJournal {

    public KEY = Symbol('id');
    private dataPartition: string;
    private static containerCache: { [key: string]: Container; } = {};

    public async getCosmoContainer(): Promise<Container> {

        const databaseId = 'sdms-db'
        const containerId = 'data';

        if (!AzureCosmosDbDAO.containerCache[this.dataPartition]) {
            const connectionParams = await AzureDataEcosystemServices.getCosmosConnectionParams(this.dataPartition);
            const cosmosClient = new CosmosClient({
                endpoint: connectionParams.endpoint,
                key: connectionParams.key
            });
            const { database } = await cosmosClient.databases.createIfNotExists({ id: databaseId });
            const { container } = await database.containers.createIfNotExists({
                id: containerId,
                maxThroughput: AzureConfig.COSMO_MAX_THROUGHPUT,
                partitionKey: '/key'
            });
            AzureCosmosDbDAO.containerCache[this.dataPartition] = container;
        }

        return AzureCosmosDbDAO.containerCache[this.dataPartition];

    }

    public constructor(tenant: TenantModel) {
        super();
        this.dataPartition = tenant.esd.indexOf('.') !== -1 ? tenant.esd.split('.')[0] : tenant.esd;
    }

    public async save(datasetEntity: any): Promise<void> {

        if (!(datasetEntity instanceof Array)) {
            datasetEntity = [datasetEntity];
        }

        for (const entity of datasetEntity) {
            const item = {
                id: entity.key.name,
                key: entity.key.partitionKey,
                data: entity.data
            }
            item.data[this.KEY.toString()] = entity.key;
            await (await this.getCosmoContainer()).items.upsert(item);
        }

    }

    public async get(key: any): Promise<[any | any[]]> {

        const item = await (await this.getCosmoContainer()).item(key.name, key.partitionKey).read();

        if (!item.resource) {
            return [undefined];
        }

        const data = item.resource.data;
        data[this.KEY] = data[this.KEY.toString()];
        delete data[this.KEY.toString()];
        return [data];
    }

    public async delete(key: any): Promise<void> {
        await (await this.getCosmoContainer()).item(key.name, key.partitionKey).delete();
    }

    public createQuery(namespace: string, kind: string): IJournalQueryModel {
        return new AzureCosmosDbQuery(namespace, kind);
    }

    public async runQuery(query: IJournalQueryModel): Promise<[any[], { endCursor?: string }]> {

        const cosmosQuery = (query as AzureCosmosDbQuery);

        let sqlQuery: string;
        let response: FeedResponse<any>;

        if (cosmosQuery.kind === Config.SUBPROJECTS_KIND) {
            sqlQuery = 'SELECT * FROM c WHERE c.key LIKE "sp-%"';
            response = await (await this.getCosmoContainer()).items.query(sqlQuery).fetchAll();
        }

        if (cosmosQuery.kind === Config.DATASETS_KIND) {

            // return selected fields
            if (cosmosQuery.projectedFieldNames.length) {
                let fieldList = '';
                for (const field of cosmosQuery.projectedFieldNames) {
                    if (fieldList) {
                        fieldList += ', ';
                    }
                    fieldList += 'c.data.' + field;
                }
                sqlQuery = 'SELECT ' + fieldList
            } else {
                sqlQuery = 'SELECT *';
            }

            // query using partial partition key
            const subprojectName = cosmosQuery.namespace.split('-').pop();
            sqlQuery += ' FROM c WHERE c.key LIKE "ds-' + subprojectName + '-%"';

            // add filters
            for (const filter of cosmosQuery.filters) {
                if (filter.operator === 'CONTAINS') {
                    sqlQuery += (' AND (ARRAY_CONTAINS(c.data.' + filter.property + ', ' + '\'' + filter.value + '\'' + ')' +
                        ' OR c.data.' + filter.property + ' = ' + '\'' + filter.value + '\'' + ')')
                } else {
                    sqlQuery += (' AND c.data.' + filter.property + ' ' + filter.operator + ' "' + filter.value + '"')
                }
            }

            // group results by field
            if (cosmosQuery.groupByFieldNames.length) {
                let groupByList = '';
                for (const field of cosmosQuery.groupByFieldNames) {
                    if (groupByList) {
                        groupByList += ', ';
                    }
                    groupByList += 'c.data.' + field;
                }
                sqlQuery += ' GROUP BY ' + groupByList;
            }

            // use paginated query if required
            if (cosmosQuery.pagingLimit) {
                response = await (await this.getCosmoContainer()).items.query(sqlQuery, {
                    continuationToken: cosmosQuery.pagingStart,
                    maxItemCount: cosmosQuery.pagingLimit
                }).fetchNext();
            } else {
                response = await (await this.getCosmoContainer()).items.query(sqlQuery).fetchAll();
            }

        }

        if (cosmosQuery.kind === Config.APPS_KIND) {
            sqlQuery = 'SELECT * FROM c WHERE c.key LIKE "ap-%"';
            response = await (await this.getCosmoContainer()).items.query(sqlQuery).fetchAll();
        }

        const results = response.resources.map(result => {
            if (!result.data) {
                return result;
            }
            if (result.data[this.KEY.toString()]) {
                result.data[this.KEY] = result.data[this.KEY.toString()];
                delete result.data[this.KEY.toString()];
            }
            return result.data;
        });

        return Promise.resolve([results, { endCursor: response.continuationToken }]);
    }

    public createKey(specs: any): object {

        const kind = specs.path[0];
        let name: string;
        let partitionKey: string;

        if (kind === AzureConfig.TENANTS_KIND) {
            name = 'tn-' + specs.path[1];
            partitionKey = name;
        }

        if (kind === AzureConfig.SUBPROJECTS_KIND) {
            name = 'sp-' + specs.path[1];
            partitionKey = name;
        }

        if (kind === AzureConfig.DATASETS_KIND) {
            name = 'ds-' + (specs.namespace as string).split('-').pop() + specs.enforcedKey
            name = name.replace(new RegExp('/', 'g'), '-')
            partitionKey = name;
        }

        if (kind === AzureConfig.APPS_KIND) {
            name = 'ap-' + specs.path[1];
            partitionKey = name;
        }

        return { name, partitionKey, kind };
    }

    public getTransaction(): IJournalTransaction {
        return new AzureCosmosDbTransactionDAO(this);
    }

    public getQueryFilterSymbolContains(): string {
        return 'CONTAINS';
    }

}

declare type Operator = '=' | '<' | '>' | '<=' | '>=' | 'HAS_ANCESTOR' | 'CONTAINS';

export class AzureCosmosDbQuery implements IJournalQueryModel {

    public constructor(namespace: string, kind: string) {
        this.namespace = namespace;
        this.kind = kind;
    }

    filter(property: string, operator?: Operator, value?: {}): IJournalQueryModel {

        if (value === undefined) {
            value = operator;
            operator = '=';
        }

        if (operator === undefined) {
            operator = '=';
        }

        if (value === undefined) {
            value = '';
        }

        this.filters.push({ property, operator, value });

        return this;
    }

    start(start: string | Buffer): IJournalQueryModel {
        if (start instanceof Buffer) {
            throw new Error('Type \'Buffer\' is not supported for CosmosDB Continuation while paging.');
        }
        this.pagingStart = start as string;
        return this;
    }

    limit(n: number): IJournalQueryModel {
        this.pagingLimit = n;
        return this;
    }

    groupBy(fieldNames: string | string[]): IJournalQueryModel {
        if (typeof fieldNames === 'string') {
            this.groupByFieldNames = [fieldNames];
        } else {
            this.groupByFieldNames = fieldNames;
        }
        return this;
    }

    select(fieldNames: string | string[]): IJournalQueryModel {
        if (typeof fieldNames === 'string') {
            this.projectedFieldNames = [fieldNames];
        } else {
            this.projectedFieldNames = fieldNames;
        }
        return this;
    }

    public filters: { property: string; operator: Operator; value: {} }[] = [];
    public projectedFieldNames: string[] = [];
    public groupByFieldNames: string[] = [];
    public pagingStart?: string;
    public pagingLimit?: number;
    public namespace: string;
    public kind: string;

}

// ===========================================================================
// TRANSACTIONS MODEL
// ===========================================================================

declare type OperationType = 'save' | 'delete';

export class AzureCosmosDbTransactionOperation {

    public constructor(type: OperationType, entityOrKey: any) {
        this.type = type;
        this.entityOrKey = entityOrKey;
    }

    public type: OperationType;
    public entityOrKey: any;
}

export class AzureCosmosDbTransactionDAO extends AbstractJournalTransaction {

    public KEY = null;

    public constructor(owner: AzureCosmosDbDAO) {
        super();
        this.owner = owner;
        this.KEY = this.owner.KEY;
    }

    public async save(entity: any): Promise<void> {
        this.queuedOperations.push(new AzureCosmosDbTransactionOperation('save', entity));
        await Promise.resolve();
    }

    public async get(key: any): Promise<[any | any[]]> {
        return await this.owner.get(key);
    }

    public async delete(key: any): Promise<void> {
        this.queuedOperations.push(new AzureCosmosDbTransactionOperation('delete', key));
        await Promise.resolve();
    }

    public createQuery(namespace: string, kind: string): IJournalQueryModel {
        return this.owner.createQuery(namespace, kind);
    }

    public async runQuery(query: IJournalQueryModel): Promise<[any[], { endCursor?: string }]> {
        return await this.owner.runQuery(query);
    }

    public async run(): Promise<void> {
        if (this.queuedOperations.length) {
            await Promise.reject('Transaction is already in use.');
        }
        else {
            this.queuedOperations = [];
            return Promise.resolve();
        }
    }

    public async rollback(): Promise<void> {
        this.queuedOperations = [];
        return Promise.resolve();
    }

    public async commit(): Promise<void> {

        for (const operation of this.queuedOperations) {
            if (operation.type === 'save') {
                await this.owner.save(operation.entityOrKey);
            }
            if (operation.type === 'delete') {
                await this.owner.delete(operation.entityOrKey);
            }
        }

        this.queuedOperations = [];
        return Promise.resolve();
    }

    public getQueryFilterSymbolContains(): string {
        return 'CONTAINS';
    }

    private owner: AzureCosmosDbDAO;
    public queuedOperations: AzureCosmosDbTransactionOperation[] = [];
}