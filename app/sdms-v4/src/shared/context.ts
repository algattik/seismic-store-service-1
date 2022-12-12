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

import { SchemaGroup, SchemaGroups } from '../apis';
import express from 'express';

export class Context {
    public static schemaGroup: SchemaGroup;

    private static urlIncludeSchemaModel = (url: string, models: string[]): boolean => {
        return models.some((model) => {
            return url.toLowerCase().includes(model);
        });
    };

    public static init(req: express.Request) {
        for (const group of SchemaGroups) {
            if (this.urlIncludeSchemaModel(req.url, group.models)) {
                this.schemaGroup = group;
                break;
            }
        }
    }
}
