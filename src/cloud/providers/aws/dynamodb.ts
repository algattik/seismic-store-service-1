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
import { AbstractJournal, IJournalQueryModel, IJournalTransaction, JournalFactory } from '../../journal';
import { AWSConfig } from './config';
import AWS from 'aws-sdk/global';
import DynamoDB from 'aws-sdk/clients/dynamodb';

import aws from 'aws-sdk';
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
        //not implemented
        return undefined;
    }

    public async runQuery(query: IJournalQueryModel): Promise<[any[], { endCursor?: string }]> {
        //not implemented
        return undefined;
    }
    public createKey(specs: any): object {
        const kind0 = specs.path[0];
        const partitionKey = specs.path[1];
        const kind = AWSConfig.SERVICE_ENV + '-' + 'SeismicStore.' + kind0;
        //kind is the table name
        return { partitionKey, kind };
    }

    public getTransaction(): IJournalTransaction {
        //not implemented
        return undefined;
    }

    public getQueryFilterSymbolContains(): string {
        //not implemented
        return undefined;
    }
}

