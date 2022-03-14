// ============================================================================
// Copyright 2017-2022, Schlumberger
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

import { CosmosClient } from '@azure/cosmos';
import { CloudFactory } from '../../cloud';
import { AzureDataEcosystemServices } from './dataecosystem';

// This background process checks the existence of these databases in each partition every 5 seconds
// * old index model database id: seistore-<partition-id>-db
// * new index model database id: sdms-dm
export class DatabaseChecker {

    private static partitions: string[];
    private static clients: { [key: string]: CosmosClient } = {};

    public static async run(): Promise<void> {
        // refresh the list of existing partitions every 60 seconds.
        // these calls will hit the partition service and the list of partition rarely change.
        setInterval(DatabaseChecker.collectPartitions, 60 * 1000);
        // refresh database existence list for each partition every 5 seconds.
        // this call hit cosmos and require to be executed more frequently.
        setInterval(DatabaseChecker.checkDatabaseExistence, 5 * 1000);
    }

    // refresh the list of existing partitions
    public static async collectPartitions(): Promise<void> {
        DatabaseChecker.partitions = (await AzureDataEcosystemServices.getPartitions()).filter((partition) => {
            return !partition.startsWith('integrationtest');
        });
    }

    // refresh the list of existing databases
    public static async checkDatabaseExistence(): Promise<void> {

        if (DatabaseChecker.partitions) {

            for (const partition of DatabaseChecker.partitions) {

                // retrieve the connection parameters if not already fetched
                if (!(partition in DatabaseChecker.clients)) {
                    try {
                        const connectionParams = await AzureDataEcosystemServices.getCosmosConnectionParams(partition);
                        DatabaseChecker.clients[partition] = new CosmosClient({
                            endpoint: connectionParams.endpoint,
                            key: connectionParams.key
                        })
                    } catch (err: any) { continue; }
                }

                // check if the new/enhanced database exist
                let enhanced = false
                try {
                    await DatabaseChecker.clients[partition].database('sdms-db').read();
                    enhanced = true
                } catch (err: any) { /* do nothing */ }

                // check if the regular database exist
                let regular = false;
                try {
                    await DatabaseChecker.clients[partition].database('seistore-' + partition + '-db').read();
                    regular = true;
                } catch (err: any) { /* do nothing */ }

                // build or update the reference databases existence object in the cloud provider
                if (partition in CloudFactory.azureDatabase) {
                    CloudFactory.azureDatabase[partition].regular = regular;
                    CloudFactory.azureDatabase[partition].enhanced = enhanced;
                } else {
                    CloudFactory.azureDatabase[partition] = { regular, enhanced };
                }

            }
        }
    }
}