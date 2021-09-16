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

import { CloudFactory } from './cloud';

export interface ILogger {
    info(data: any): void;
    error(data: any): void;
    metric(key: string, data: any): void;
}
export abstract class AbstractLogger implements ILogger {
    public abstract info(data: any): void;
    public abstract error(data: any): void;
    public abstract metric(key: string, data: any): void;

}
export class LoggerFactory extends CloudFactory {
    public static build(providerLabel: string, args: { [key: string]: any; } = {}): ILogger {
        return CloudFactory.build(providerLabel, AbstractLogger, args) as ILogger;
    }
}