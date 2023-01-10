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

import { Tx } from '../utils';
import { TestGoogleCredentials } from './google/credentials';
import { TestGoogleDatastoreDAO, TestGoogleDatastoreTransactionDAO } from './google/datastore';
import { TestAzureCosmosDbDAO } from './azure/cosmosdb';
import { TestAzureCosmosDbTransactionDAO } from './azure/cosmosdb-transactions';
import { TestGCSCore } from './google/gcs';
import { TestAzureKeyVault } from './azure/keyvault';
import { TestAzureStorage } from './azure/cloudstorage';
import { TestAzureCosmosDbDAORegular } from './azure/azureCosmosDbDAORegular';


export class TestCloud {

    public static run() {

        describe(Tx.title('utest seismic store - cloud core'), () => {
            TestGoogleCredentials.run();
            TestGCSCore.run();
            TestGoogleDatastoreDAO.run();
            TestGoogleDatastoreTransactionDAO.run();
            TestAzureCosmosDbDAORegular.run();
            TestAzureCosmosDbDAO.run();
            TestAzureCosmosDbTransactionDAO.run();
            TestAzureKeyVault.run();
            TestAzureStorage.run();
        });

    }

}
