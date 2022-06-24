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

import Ajv from 'ajv';
import { Utils } from './utils';
import addFormats from 'ajv-formats';
import path from 'path';

export interface SchemaValidationResult {
    valid: boolean;
    error: string;
}

export class Schema {
    private static mapSchema: { [key: string]: object } = {};

    private static async getSchema(referenceSchema: string) {
        let schema = this.mapSchema[referenceSchema];
        if (!schema) {
            const schemaFilePath: string = path.resolve(__dirname, '../docs/schemas/generated/' + referenceSchema);
            schema = JSON.parse(JSON.stringify(await Utils.resolveJsonReferences(schemaFilePath)));
            this.mapSchema[referenceSchema] = schema;
        }
        return schema;
    }

    public static async getSchemaKind(referenceSchema: string): Promise<string> {
        return (await this.getSchema(referenceSchema))['x-osdu-schema-source'];
    }

    public static async validate(data: any, referenceSchema: string): Promise<SchemaValidationResult> {
        const schema = await this.getSchema(referenceSchema);
        const ajv = new Ajv({
            strict: false,
            strictTypes: false,
            allErrors: true,
            unicodeRegExp: false,
        });

        ajv.addFormat('integer', {
            type: 'number',
            validate: (x: number) => x >= Number.MIN_VALUE && x <= Number.MAX_VALUE,
        });

        addFormats(ajv);

        const valid = ajv.validate(schema, data);
        return {
            valid,
            error: valid ? undefined : ajv.errors[0].instancePath + ' ' + ajv.errors[0].message,
        };
    }
}
