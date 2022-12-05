// ============================================================================
// Copyright 2017-2022, Schlumberger
//
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// Distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// Limitations under the License.
// ============================================================================

import { Error, Params, Schema } from '../../shared';
import { Context } from '../../shared/context';
import { SchemaListRequest } from './model';
import { Request as expRequest } from 'express';
import fs from 'fs';
import path from 'path';

export class Parser {
    private static baseModelsPath = '../../docs/schemas/generated/';
    public static async register(req: expRequest): Promise<object[]> {
        Params.checkBodyArray(req.body);
        const requestModel = req.baseUrl.split('/').pop();
        const model = this.getReferenceModel(requestModel);

        for (const record of req.body) {
            const validationResult = await Schema.validate(record, Context.schemaGroup.folder + '/' + model);
            if (!validationResult || !validationResult.valid) {
                throw Error.make(Error.Status.BAD_REQUEST, 'Schema validation error: ' + validationResult.error);
            }
        }
        return req.body;
    }

    private static getReferenceModel(requestModel: string): string {
        const models = fs.readdirSync(path.resolve(__dirname, this.baseModelsPath + Context.schemaGroup.folder));
        const model = models
            .filter((model) => {
                if (Context.schemaGroup.prefix) {
                    return (
                        model.toLowerCase().indexOf(Context.schemaGroup.prefix) !== -1 &&
                        model.toLowerCase().indexOf('.' + requestModel.toLowerCase() + '.') !== -1
                    );
                } else {
                    return model.toLowerCase().indexOf(requestModel.toLowerCase() + '.') !== -1;
                }
            })
            .sort()
            .pop();
        if (!model) {
            throw Error.make(Error.Status.BAD_REQUEST, 'the "' + requestModel + '" data type is not supported');
        }
        return model;
    }
    public static get(req: expRequest): string {
        return req.params.id as string;
    }

    public static getVersion(req: expRequest): [string, string] {
        return [req.params.id as string, req.params.version as string];
    }

    public static async listSchemas(req: expRequest): Promise<SchemaListRequest> {
        const requestModel = req.baseUrl.split('/').pop();
        const model = this.getReferenceModel(requestModel);
        return {
            kind: await Schema.getSchemaKind(Context.schemaGroup.folder + '/' + model),
            pagination: {
                paginationLimit: +req.query['page-limit'],
                paginationCursor: req.query['next-page-token'] as string,
            },
        };
    }
}
