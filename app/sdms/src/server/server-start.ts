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

import { Config, ConfigFactory, LoggerFactory, TraceFactory } from '../cloud';
import { StorageJobManager } from '../cloud/shared/queue';
import { Locker } from '../services/dataset/locker';
import { SchemaManagerFactory } from '../services/dataset/schema-manager';
import { Feature, FeatureFlags, initSharedCache } from '../shared';
import { SwaggerManager } from './swagger-manager';

async function ServerStart() {

    try {

        // tslint:disable-next-line
        console.log('- Initializing cloud provider');
        Config.setCloudProvider(process.env.CLOUDPROVIDER);

        // tslint:disable-next-line
        console.log('- Initializing ' + Config.CLOUDPROVIDER + ' configurations');
        await ConfigFactory.build(Config.CLOUDPROVIDER).init();

        // tslint:disable-next-line
        console.log('- Initializing redis locker cache');
        await Locker.init();

        // tslint:disable-next-line
        console.log('- Initializing redis shared cache');
        initSharedCache();

        // tslint:disable-next-line
        console.log('- Initializing storage transfer daemon');
        StorageJobManager.setup({
            ADDRESS: Config.DES_REDIS_INSTANCE_ADDRESS,
            PORT: Config.DES_REDIS_INSTANCE_PORT,
            KEY: Config.DES_REDIS_INSTANCE_KEY,
            DISABLE_TLS: Config.DES_REDIS_INSTANCE_TLS_DISABLE
        });

        if (FeatureFlags.isEnabled(Feature.TRACE)) {
            // tslint:disable-next-line
            console.log('- Initializing cloud tracer');
            TraceFactory.build(Config.CLOUDPROVIDER).start();
        }

        process.on('unhandledRejection', (reason, promise) => {
            LoggerFactory.build(Config.CLOUDPROVIDER).error('Unhandled rejection caught at ' + promise + ' due to reason ' + reason);
        });

        // tslint:disable-next-line
        console.log('- Initializing schema managers');
        await SchemaManagerFactory.initialize();

        // tslint:disable-next-line
        console.log('- Initializing swagger-doc manager');
        await SwaggerManager.init();

        await new (await import('./server')).Server().start();

    } catch (error) {
        // tslint:disable-next-line
        LoggerFactory.build(Config.CLOUDPROVIDER).error(JSON.stringify(error));
        process.exit(1);
    }

}

// tslint:disable-next-line: no-floating-promises no-console
ServerStart().catch((error) => { LoggerFactory.build(Config.CLOUDPROVIDER).error(JSON.stringify(error)); });
