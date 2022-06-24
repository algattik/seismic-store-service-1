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

import { DatasetListRequest } from './model';
import { Request as expRequest } from 'express';
import fs from 'fs';
import path from 'path';

export class Parser {
    public static datasetModels: string[];
    private static baseModelsPath = '../../docs/schemas/generated/';
    private static datasetModelsFolder = 'dataset';
    public static async register(req: expRequest): Promise<object[]> {
        Params.checkBodyArray(req.body);
        const requestModel = req.baseUrl.split('/').pop();
        const model = this.getReferenceModel(requestModel);

        for (const record of req.body) {
            const validationResult = await Schema.validate(record, this.datasetModelsFolder + '/' + model);
            if (!validationResult || !validationResult.valid) {
                throw Error.make(Error.Status.BAD_REQUEST, 'Schema validation error: ' + validationResult.error);
            }
        }
        return req.body;
    }

    private static getReferenceModel(requestModel: string): string {
        if (!this.datasetModels) {
            this.datasetModels = fs.readdirSync(
                path.resolve(__dirname, this.baseModelsPath + this.datasetModelsFolder)
            );
        }
        const model = this.datasetModels
            .filter((model) => {
                return (
                    model.toLowerCase().indexOf('filecollection.') !== -1 &&
                    model.toLowerCase().indexOf('.' + requestModel.toLowerCase() + '.') !== -1
                );
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

    public static async listDatasets(req: expRequest): Promise<DatasetListRequest> {
        const requestModel = req.baseUrl.split('/').pop();
        const model = this.getReferenceModel(requestModel);
        return {
            kind: await Schema.getSchemaKind(this.datasetModelsFolder + '/' + model),
            pagination: {
                paginationLimit: +req.query['page-limit'],
                paginationCursor: req.query['next-page-token'] as string,
            },
        };
    }
}
