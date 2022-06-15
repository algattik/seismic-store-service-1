using Microsoft.Azure.Cosmos;

namespace Sidecar.Services
{
    public class Cosmos : IDataAccess
    {
        private readonly string databaseId = "sdms-db";
        private readonly string containerId = "data";

        private static Dictionary<string, CosmosClient> cosmosClients = new Dictionary<string, CosmosClient>();

        public async Task Insert(string cs, Record? record)
        {
            if (record == null) { return; };
            this.initCosmosClient(cs);
            Database database = Cosmos.cosmosClients[cs].GetDatabase(this.databaseId);
            Container container = database.GetContainer(this.containerId);
            await container.UpsertItemAsync<Record>(record, new PartitionKey(record.Id));
        }

        public async Task<Record> Get(string cs, string pk)
        {
            this.initCosmosClient(cs);
            Database database = Cosmos.cosmosClients[cs].GetDatabase(this.databaseId);
            Container container = database.GetContainer(this.containerId);
            return await container.ReadItemAsync<Record>(pk, new PartitionKey(pk));
        }

        public async Task Delete(string cs, string pk)
        {
            this.initCosmosClient(cs);
            Database database = Cosmos.cosmosClients[cs].GetDatabase(this.databaseId);
            Container container = database.GetContainer(this.containerId);
            await container.DeleteItemAsync<Record>(pk, new PartitionKey(pk));
        }

        public async Task<PaginatedRecords> Query(string cs, string sql, string? ctoken, int? limit)
        {
            this.initCosmosClient(cs);
            Database database = Cosmos.cosmosClients[cs].GetDatabase(this.databaseId);
            Container container = database.GetContainer(this.containerId);
            List<Record> records = new List<Record>();
            QueryRequestOptions options = new QueryRequestOptions() { MaxItemCount = limit != null ? limit : 100 };
            FeedIterator<Record> query = container.GetItemQueryIterator<Record>(
                sql,
                continuationToken: ctoken,
                requestOptions: options);
            if (ctoken == null && limit == null) // fetch all
            {
                while (query.HasMoreResults) 
                {
                    var results = await query.ReadNextAsync();
                    foreach (Record record in results)
                    {
                        records.Add(record);
                    }
                }
                PaginatedRecords paginatedRecords = new PaginatedRecords();
                paginatedRecords.records = records;
                paginatedRecords.continuationToken = null;
                return paginatedRecords;
            }
            else // fetch next page
            {
                var results = await query.ReadNextAsync();
                foreach (Record record in results)
                {
                    records.Add(record);
                }
                PaginatedRecords paginatedRecords = new PaginatedRecords();
                paginatedRecords.records = records;
                paginatedRecords.continuationToken = results.ContinuationToken;
                return paginatedRecords;
            }
        }

        private void initCosmosClient(string cs)
        {
            if (!Cosmos.cosmosClients.ContainsKey(cs))
            {
                Cosmos.cosmosClients[cs] = new CosmosClient(cs, new CosmosClientOptions()
                {
                    SerializerOptions = new CosmosSerializationOptions()
                    {
                        IgnoreNullValues = true
                    },
                    ConnectionMode = ConnectionMode.Direct,
                });
            }
        }
    }
}
