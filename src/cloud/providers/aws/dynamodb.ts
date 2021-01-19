// Copyright © 2020 Amazon Web Services
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

import { TenantModel } from '../../../services/tenant';
import { AbstractJournal, AbstractJournalTransaction, IJournalQueryModel, IJournalTransaction, JournalFactory } from '../../journal';
import { AWSConfig } from './config';
import AWS from 'aws-sdk/global';
import DynamoDB, { ScanInput } from 'aws-sdk/clients/dynamodb';

import aws from 'aws-sdk';
import { PromiseResult } from 'aws-sdk/lib/request';
const converter = aws.DynamoDB.Converter;

@JournalFactory.register('aws')
export class AWSDynamoDbDAO extends AbstractJournal {

    public KEY = Symbol('id');
    public constructor(tenant: TenantModel) {
        super();
        AWS.config.update({ region: AWSConfig.AWS_REGION });

    }

    public async save(datasetEntity: any): Promise<void> {
        if (!(datasetEntity instanceof Array)) {
            datasetEntity = [datasetEntity];
        }
        for (const entity of datasetEntity) {
            const item = entity.data;
            const itemMarshall = converter.marshall(item);
            console.log('from table ' + entity.key.kind + ' save ' + JSON.stringify(itemMarshall));
            const para = {
                TableName: entity.key.kind,
                Item: itemMarshall
            };
            const db = new DynamoDB({});
            await db.putItem(para).promise();
        }
    }

    public async get(key: any): Promise<[any | any[]]> {
        const item = { 'name': key.partitionKey };
        const itemMarshall = converter.marshall(item);
        console.log('from table ' + key.kind + ' get ' + JSON.stringify(itemMarshall));
        const params = {
            TableName: key.kind,
            Key: itemMarshall
        };
        const db = new DynamoDB({});
        const data = await db.getItem(params).promise();
        const ret = converter.unmarshall(data.Item);
        if (Object.keys(ret).length === 0)
            return [undefined];
        else
            return [ret];
    }

    public async delete(key: any): Promise<void> {
        const item = { 'name': key.partitionKey };
        const itemMarshall = converter.marshall(item);
        console.log('from table ' + key.kind + ' delete ' + JSON.stringify(itemMarshall));
        const params = {
            TableName: key.kind,
            Key: itemMarshall
        };
        const db = new DynamoDB({});
        await db.deleteItem(params).promise();
    }

    public createQuery(namespace: string, kind: string): IJournalQueryModel {
        return new AWSDynamoDbQuery(namespace, kind);
    }

    public async runQuery(query: IJournalQueryModel): Promise<[any[], { endCursor?: string }]> {
        const dbQuery = (query as AWSDynamoDbQuery);
        const statement = dbQuery.getQueryStatement(AWSConfig.DATASETS_KIND);
        // const statement = {
        //     TableName : 'osdu-kogliny-SeismicStore.datasets',
        //     FilterExpression: "#path=:path",
        //     KeyConditionExpression: '#name=:name',
        //     ExpressionAttributeNames: {
        //          "#name": "name",
        //          "#path": "path"
        //     },
        //     ExpressionAttributeValues: {
        //         ":name": 'yk-2dataset',
        //         ":path": '/a/b/c/'
        //     }       
        // };
        console.log('query ' + JSON.stringify(statement));
        const db = new DynamoDB.DocumentClient();
        var scanResults = [];
        var items: PromiseResult<DynamoDB.DocumentClient.ScanOutput, AWS.AWSError>;
        do {
            items = await db.scan(statement).promise();
            const results = items.Items.map(result => {
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
            scanResults = scanResults.concat(results);
            statement.ExclusiveStartKey = items.LastEvaluatedKey;
        } while (typeof items.LastEvaluatedKey !== "undefined");
        return Promise.resolve( [scanResults, {endCursor: items.LastEvaluatedKey}]);
    }

    public createKey(specs: any): object {
        const kind0 = specs.path[0];
        const partitionKey = specs.path[1];
        const kind = AWSConfig.SERVICE_ENV + '-' + 'SeismicStore.' + kind0;
        //kind is the table name
        return { partitionKey, kind };
    }

    public getTransaction(): IJournalTransaction {
        return new AWSDynamoDbTransactionDAO(this);
    }

    public getQueryFilterSymbolContains(): string {
        return 'contains';
    }
}


declare type OperationType = 'save' | 'delete';
export class AWSDynamoDbTransactionOperation {

    public constructor(type: OperationType, entityOrKey: any) {
        this.type = type;
        this.entityOrKey = entityOrKey;
    }

    public type: OperationType;
    public entityOrKey: any;
}

export class AWSDynamoDbTransactionDAO extends AbstractJournalTransaction {

    public KEY = null;

    public constructor(owner: AWSDynamoDbDAO) {
        super();
        this.owner = owner;
        this.KEY = this.owner.KEY;
    }

    public async save(entity: any): Promise<void> {
        console.log('aws Transaction Save ' + JSON.stringify(entity));
        this.queuedOperations.push(new AWSDynamoDbTransactionOperation('save', entity));
        await Promise.resolve();
    }

    public async get(key: any): Promise<[any | any[]]> {
        console.log('aws Transaction get ' + JSON.stringify(key));
        return await this.owner.get(key);
    }

    public async delete(key: any): Promise<void> {
        console.log('aws Transaction delete ' + JSON.stringify(key));
        this.queuedOperations.push(new AWSDynamoDbTransactionOperation('delete', key));
        await Promise.resolve();
    }

    public createQuery(namespace: string, kind: string): IJournalQueryModel {
        console.log('aws Transaction createQuery ' + namespace + kind);
        return this.owner.createQuery(namespace, kind);
    }

    public async runQuery(query: IJournalQueryModel): Promise<[any[], { endCursor?: string }]> {
        console.log('aws Transaction runQuery ' + JSON.stringify(query));
        return await this.owner.runQuery(query);
    }

    public async run(): Promise<void> {
        console.log('aws Transaction run ');
        if (this.queuedOperations.length) {
            await Promise.reject('Transaction is already in use.');
        }
        else {
            this.queuedOperations = [];
            return Promise.resolve();
        }
    }

    public async rollback(): Promise<void> {
        console.log('aws Transaction rollback ');
        this.queuedOperations = [];
        return Promise.resolve();
    }

    public async commit(): Promise<void> {
        console.log('aws Transaction commit ');
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
        return 'contains';
    }

    private owner: AWSDynamoDbDAO;
    public queuedOperations: AWSDynamoDbTransactionOperation[] = [];
}

declare type Operator = '=' | '<' | '>' | '<=' | '>=' | 'HAS_ANCESTOR' | 'CONTAINS';
export class AWSDynamoDbQuery implements IJournalQueryModel {

    public constructor(namespace: string, kind: string) {
        this.namespace = namespace;
        this.kind = kind;
        this.queryStatement = { TableName: kind, FilterExpression: '', ExpressionAttributeNames: {}, ExpressionAttributeValues: {} };
    }
    public namespace: string;
    public kind: string;
    public queryStatement: ScanInput;

    filter(property: string, value: {}): IJournalQueryModel;

    filter(property: string, operator: Operator, value: {}): IJournalQueryModel;

    filter(property: string, operator?: Operator, value?: {}): IJournalQueryModel {
        if (operator === 'CONTAINS') {
            this.queryStatement.FilterExpression += 'contains(#' + property + ',:' + property + ')';
            this.queryStatement.ExpressionAttributeNames['#' + property] = property;
            this.queryStatement.ExpressionAttributeValues[':' + property] = value;
            return this;
        }
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

        if (operator === 'HAS_ANCESTOR') {
            throw new Error('HAS_ANCESTOR operator is not supported in query filters.');
        }
        if (!!(this.queryStatement.FilterExpression))
            this.queryStatement.FilterExpression += ' AND ';

        this.queryStatement.FilterExpression += '#' + property + operator + ':' + property;
        this.queryStatement.ExpressionAttributeNames['#' + property] = property;
        this.queryStatement.ExpressionAttributeValues[':' + property] = value;
        return this;
    }

    start(start: string | Buffer): IJournalQueryModel {
        if (start instanceof Buffer) {
            throw new Error('Type \'Buffer\' is not supported for DynamoDB Continuation while paging.');
        }
        // this.queryStatement.ExclusiveStartKey = start as DynamoDB.String;
        console.log('NOT SUPPOR aws start createQuery ' + start);
        return this;
    }

    limit(n: number): IJournalQueryModel {
        this.queryStatement.Limit = n;
        return this;
    }

    groupBy(fieldNames: string | string[]): IJournalQueryModel {
        console.log('NOT SUPPORT aws groupBy createQuery ' + fieldNames);
        return this;
    }

    select(fieldNames: string | string[]): IJournalQueryModel {
        if (this.queryStatement.ProjectionExpression.length >= 1)
            this.queryStatement.ProjectionExpression += ',';
        if (typeof fieldNames === 'string') {
            this.queryStatement.ProjectionExpression += fieldNames;
        } else {
            this.queryStatement.ProjectionExpression += fieldNames.join(',');
        }
        return this;
    }
    public getQueryStatement(tableName: string): ScanInput {
        //delete empty objects in query parameters
        if (Object.entries(this.queryStatement.ExpressionAttributeNames).length === 0) {
            delete this.queryStatement.ExpressionAttributeNames;
            delete this.queryStatement.ExpressionAttributeValues;
        }
        if (this.queryStatement.FilterExpression.length === 0)
            delete this.queryStatement.FilterExpression;

        this.queryStatement.TableName = AWSConfig.SERVICE_ENV + '-SeismicStore.' + tableName;
        return this.queryStatement;
    }
}