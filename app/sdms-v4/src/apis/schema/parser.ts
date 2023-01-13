// ============================================================================
// Copyright 2017-2023, Schlumberger
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

export class Parser {
    public static async register(req: expRequest, dataPartition: string): Promise<object[]> {
        Params.checkBodyArray(req.body);

        for (const record of req.body) {
            const validationResult = await Schema.validate(
                record,
                req.headers.authorization,
                dataPartition,
                record.kind
            );
            if (!validationResult || !validationResult.valid) {
                throw Error.make(Error.Status.BAD_REQUEST, 'Schema validation error: ' + validationResult.error);
            }
        }
        return req.body;
    }

    public static get(req: expRequest): string {
        return req.params.id as string;
    }

    public static getVersion(req: expRequest): [string, string] {
        return [req.params.id as string, req.params.version as string];
    }

    public static async listSchemas(req: expRequest, dataPartition: string): Promise<SchemaListRequest> {
        return {
            kind: await Schema.getSchemaKind(req.headers.authorization, dataPartition, Context.schemaEndpoint.kind),
            pagination: {
                paginationLimit: +req.query['page-limit'],
                paginationCursor: req.query['next-page-token'] as string,
            },
        };
    }
}
