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

import { Config } from '.';
import { Error } from '../shared';

// to-remove once the migration to the new DB has been completed in all Azure deployments
export const ENABLED_COSMOS_MIGRATION = process.env.ENABLED_COSMOS_MIGRATION !== 'false';
export const ENABLE_USAGE_COSMOS_DATABASE_OLD_INDEX = process.env.ENABLE_USAGE_COSMOS_DATABASE_OLD_INDEX === 'true';

export class CloudFactory {

    public static register(providerLabel: string) {
        return (target: any) => {
            if (CloudFactory.providers[providerLabel]) {
                CloudFactory.providers[providerLabel].push(target);
            } else {
                CloudFactory.providers[providerLabel] = [target];
            }
            return target;
        };
    }

    public static azureDatabase: { [key: string]: { regular: boolean, enhanced: boolean } } = {}

    public static build(providerLabel: string, referenceAbstraction: any, args: { [key: string]: any } = {}) {

        if (providerLabel === undefined || providerLabel === 'unknown') {
            throw Error.make(Error.Status.UNKNOWN, `Unrecognized cloud provider: ${providerLabel}`);
        }

        if (!ENABLED_COSMOS_MIGRATION) {

            for (const provider of CloudFactory.providers[providerLabel]) {
                if (provider.prototype instanceof referenceAbstraction) {
                    if (ENABLE_USAGE_COSMOS_DATABASE_OLD_INDEX && provider.name === 'AzureCosmosDbDAO') {
                        continue;
                    }
                    return new provider(args);
                }
            }
            throw Error.make(Error.Status.UNKNOWN,
                `The cloud provider builder that extend ${referenceAbstraction} has not been found`);

        } else { // to-remove once the migration to the new DB has been completed in all Azure deployments
            const azureJournalProviders: any[] = []; // This is temporary required by Azure deployments.
            for (const provider of CloudFactory.providers[providerLabel]) {

                if (provider.prototype instanceof referenceAbstraction) {

                    // This is temporary required by Azure deployments.
                    // It will allow cosmos databases migration to a new index model with no downtime.
                    // This condition will be removed once the migration process is completed.
                    if (provider.name === 'AzureCosmosDbDAO' || provider.name === 'AzureCosmosDbDAORegular') {
                        if (ENABLE_USAGE_COSMOS_DATABASE_OLD_INDEX && provider.name === 'AzureCosmosDbDAORegular') {
                            return new provider(args);
                        }
                        azureJournalProviders.push(provider);
                    } else {
                        return new provider(args);
                    }
                }

            }

            // This is temporary required by Azure deployments.
            // It will allow cosmos databases migration to a new index model with no downtime.
            // This if condition it will be removed once the migration process is completed.
            if (azureJournalProviders.length > 0) {

                const partition = args.name;

                // the list of partitions is refreshed every minute.
                // if a newly partition is created return the enhanced implementation
                if (!(partition in CloudFactory.azureDatabase)) {
                    for (const azureProvider of azureJournalProviders) {
                        if (azureProvider.name === 'AzureCosmosDbDAO') {
                            return new azureProvider(args);
                        }
                    }
                }

                // both database cannot exist at the same time. the migration process is probably running
                if (CloudFactory.azureDatabase[partition].regular && CloudFactory.azureDatabase[partition].enhanced) {
                    throw (Error.make(Error.Status.NOT_AVAILABLE,
                        'The partition has 2 active databases in cosmos. A migration process is possibly in place.'));
                }

                // database are not detected most probably due to an issue with cosmos <> 404, example 429 rate-limit
                if (!CloudFactory.azureDatabase[partition].regular && !CloudFactory.azureDatabase[partition].enhanced) {
                    throw (Error.make(Error.Status.NOT_AVAILABLE,
                        'The service could not locate the internal Cosmos DB. Call should be retried'));
                }

                // load the right implementation. supported is provided for both version of the db.
                // if no database exist, the new one will be used (newly created partitions)
                Config.ENFORCE_SCHEMA_BY_KEY = !CloudFactory.azureDatabase[partition].regular
                const cosmosClassName = CloudFactory.azureDatabase[partition].regular ? 'AzureCosmosDbDAORegular' : 'AzureCosmosDbDAO';
                for (const azureProvider of azureJournalProviders) {
                    if (azureProvider.name === cosmosClassName) {
                        return new azureProvider(args);
                    }
                }
            }

            throw Error.make(Error.Status.UNKNOWN,
                `The cloud provider builder that extend ${referenceAbstraction} has not been found`);
        }
    }

    private static providers: { [key: string]: any[] } = {};

}
