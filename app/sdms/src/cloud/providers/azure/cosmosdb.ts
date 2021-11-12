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

import { CosmosClient, Container, SqlQuerySpec, SqlParameter, FeedOptions } from '@azure/cosmos';
import {
    AbstractJournal, AbstractJournalTransaction,
    IJournalQueryModel, IJournalTransaction, JournalFactory
} from '../../journal';
import { Utils } from '../../../shared/utils'
import { TenantModel } from '../../../services/tenant';
import { AzureDataEcosystemServices } from './dataecosystem';
import { AzureConfig } from './config';

@JournalFactory.register('azure')
export class AzureCosmosDbDAO extends AbstractJournal {

    public KEY = Symbol('id');
    private dataPartition: string;
    private static containerCache: { [key: string]: Container; } = {};

    public async getCosmoContainer(): Promise<Container> {
        const containerId = 'seistore-' + this.dataPartition + '-container';
        if (AzureCosmosDbDAO.containerCache[containerId]) {
            return AzureCosmosDbDAO.containerCache[containerId];
        } else {
            const connectionParams = await AzureDataEcosystemServices.getCosmosConnectionParams(this.dataPartition);
            const cosmosClient = new CosmosClient({
                endpoint: connectionParams.endpoint,
                key: connectionParams.key
            });
            const { database } =  await cosmosClient.databases.createIfNotExists({id: 'seistore-' + this.dataPartition + '-db'});
            const { container } = await database.containers.createIfNotExists({
                id: 'seistore-' + this.dataPartition + '-container',
                maxThroughput: AzureConfig.COSMO_MAX_THROUGHPUT,
                partitionKey: '/key'
            });
            AzureCosmosDbDAO.containerCache[containerId] = container;
            return AzureCosmosDbDAO.containerCache[containerId];
        }
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
            if (entity.ctag) {
                item.data.ctag = entity.ctag;
            }
            await (await this.getCosmoContainer()).items.upsert(item);
        }

    }

    public async get(key: any): Promise<[any | any[]]> {
        const item = await (await this.getCosmoContainer()).item(key.name, key.partitionKey).read();

        if (item.resource === undefined) {
            return [undefined];
        };

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
        const statement = cosmosQuery.prepareSqlStatement(AzureConfig.DATASETS_KIND);

        const response = await (await this.getCosmoContainer()).items.query(
            statement.spec, statement.options).fetchNext();
        const results = response.resources.map(result => {
            if (!result.data) {
                return result;
            } else {
                if (result.data[this.KEY.toString()]) {
                    result.data[this.KEY] = result.data[this.KEY.toString()];
                    delete result.data[this.KEY.toString()];
                    return result.data;
                } else {
                    return result.data;
                }
            }
        });

        return Promise.resolve(
            [
                results,
                {
                    endCursor: response.continuationToken
                }
            ]);
    }

    public createKey(specs: any): object {
        const kind = specs.path[0];
        const partitionKey = specs.namespace + '-' + kind;
        let name: string;
        if (kind === AzureConfig.DATASETS_KIND) {
            name = Utils.makeID(16);
        } else if (kind === AzureConfig.SEISMICMETA_KIND) {
            name = specs.path[1].replace(/\W/g, '-');
        } else {
            name = specs.path[1];
        }
        return { name, partitionKey, kind };
    }

    // new instance of AzureCosmosDbTransactionDAO
    public getTransaction(): IJournalTransaction {
        return new AzureCosmosDbTransactionDAO(this);
    }

    public getQueryFilterSymbolContains(): string {
        return 'CONTAINS';
    }

    public type: OperationType;
    public entityOrKey: any;
}

declare type OperationType = 'save' | 'delete';

export class AzureCosmosDbTransactionOperation {

    public constructor(type: OperationType, entityOrKey: any) {
        this.type = type;
        this.entityOrKey = entityOrKey;
    }

    public type: OperationType;
    public entityOrKey: any;
}

/**
 * A wrapper class for datastore transactions
 * ! Note: looks awfully close to datastore interface.
 */
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

declare type Operator = '=' | '<' | '>' | '<=' | '>=' | 'HAS_ANCESTOR' | 'CONTAINS';

class SqlStatementBuilder {

    constructor(tableName: string, alias: string) {
        this.tableName = tableName;
        this.alias = alias;
    }

    public getUniqueParameterName(baseName: string): string {
        let actualName = baseName;
        let paramIndex = 0;

        // find the first variation of this param name that is unused
        while (this.parameterValues.find(p => p.name === `@${actualName}`)) {
            paramIndex++;
            actualName = `${actualName}${paramIndex}`;
        }

        return actualName;
    }

    public addFilterExpression(expression: string, parameterName: string, value: {}) {
        this.filterExpressions.push(expression);
        this.parameterValues.push({ name: parameterName, value });
    }

    public build(): SqlQuerySpec {
        let query = '';

        query = '';
        for (const filter of this.filterExpressions) {
            if (query) {
                query += ' AND ';
            }
            query += filter;
        }

        if (query) {
            query = `WHERE ${query}`;
        }

        let fieldList = '*';
        if (this.projectedFieldNames.length) {
            fieldList = '';
            for (const field of this.projectedFieldNames) {
                if (fieldList) {
                    fieldList += ', ';
                }
                fieldList += `${this.alias}.data.${field}`;
            }
        }

        if (query) {
            query = `SELECT ${fieldList} FROM ${this.tableName} AS ${this.alias} ${query}`;
        }
        else {
            query = `SELECT ${fieldList} FROM ${this.tableName} AS ${this.alias}`;
        }

        if (this.groupByFieldNames.length) {
            let groupByList = '';
            for (const field of this.groupByFieldNames) {
                if (groupByList) {
                    groupByList += ', ';
                }
                groupByList += `${this.alias}.data.${field}`;
            }
            query = `${query} GROUP BY ${groupByList}`;
        }

        return {
            query,
            parameters: this.parameterValues
        };
    }

    public tableName: string;
    public alias: string;
    private filterExpressions: string[] = [];
    private parameterValues: SqlParameter[] = [];
    public projectedFieldNames: string[] = [];
    public groupByFieldNames: string[] = [];
}

class AzureCosmosDbFilter {

    public constructor(property: string, operator: Operator, value: {}) {
        this.property = property;
        this.operator = operator;
        this.value = value;
    }

    public property: string;

    public operator: Operator;

    public value: {};

    public addFilterExpression(toStatement: SqlStatementBuilder) {
        if (this.operator === 'HAS_ANCESTOR') {
            throw new Error('HAS_ANCESTOR operator is not supported in query filters.');
        }
        const parameterName = `@${toStatement.getUniqueParameterName(this.property)}`;

        if (this.operator === 'CONTAINS') {
            toStatement.addFilterExpression(
                `ARRAY_CONTAINS(${toStatement.alias}.data.${this.property} , ${parameterName})`,
                parameterName,
                this.value
            );
        }
        else {
            toStatement.addFilterExpression(
                `${toStatement.alias}.data.${this.property} ${this.operator} ${parameterName}`,
                parameterName,
                this.value
            );
        }

    }
}

/**
 * A shim for CosmosDB that provides compatibility with Google's SDK.
 * ! Note: looks awfully close to Google Query interface.
 */
export class AzureCosmosDbQuery implements IJournalQueryModel {

    public constructor(namespace: string, kind: string) {
        this.namespace = namespace;
        this.kind = kind;
    }

    filter(property: string, value: {}): IJournalQueryModel;

    filter(property: string, operator: Operator, value: {}): IJournalQueryModel;

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

        const filter = new AzureCosmosDbFilter(property, operator, value);

        this.filters.push(filter);

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

    private filters: AzureCosmosDbFilter[] = [];
    private projectedFieldNames: string[] = [];
    private groupByFieldNames: string[] = [];
    private pagingStart?: string;
    private pagingLimit?: number;
    public namespace: string;
    public kind: string;

    public prepareSqlStatement(tableName: string): { spec: SqlQuerySpec, options: FeedOptions } {

        const builder = new SqlStatementBuilder(tableName, 'a');

        for (const filter of this.filters) {
            filter.addFilterExpression(builder);
        }

        builder.projectedFieldNames = this.projectedFieldNames;
        builder.groupByFieldNames = this.groupByFieldNames;

        const spec = builder.build();

        return {
            spec,
            options: {
                partitionKey: `${this.namespace}-${this.kind}`,
                continuationToken: this.pagingStart,
                maxItemCount: this.pagingLimit || -1
            }
        };
    }
}
