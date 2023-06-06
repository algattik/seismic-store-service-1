# Developing SDMS on Azure

## Required infrastructure

### Azure resources

Use the provided Terraform code to spin Azure resources required by the runtime (Service Principal, App Insights, Cosmos DB, Redis, Storage account) and populate a Key Vault with config values.

In `azure.tf`, adapt `base_resource_name` to a globally unique string with only lowercase letters.

Run:

```
terraform init
terraform apply
```

Then, run:

````
terraform output -raw config > .env
terraform output -raw script_config > local-config.sh
terraform output -raw partition_server_config > partition-server-config.sh
````



### Access Token

The codebase contains a Python script to generate a JWT token.

Install required Python libraries:

```
sudo apt-get install -y python3-pip
pip3 install msal
```

Generate Python script configuration:

```
source local-config.sh
```

Run Python script:

```
python3 ../../devops/scripts/azure_jwt_client.py > local-token
```

### Partition Server

SDMS requires access to a Partition Server (REST API).

#### Build

Outside of devcontainer:

```git checkout remotes/origin/release/0.21
git clone -b release/0.21 https://community.opengroup.org/osdu/platform/system/partition.git
```

```
docker run -it --rm -v "$PWD/partition":/c -v $HOME/.m2:/root/.m2 -w /c maven:3.8.6-jdk-8-slim mvn package --projects :partition-azure --also-make -Djacoco.skip=true
```

 ````
 cp partition/provider/partition-azure/target/partition-azure-*-spring-boot.jar partition-server.jar
 ````

#### Run

In devcontainer:

```
sudo apt install -y openjdk-11-jre
```

```
java -Dspring.application.name=ps -Dspring.profiles.active=local -jar partition-server.jar
```

#### Test unauthenticated query

```curl http://localhost:8080/api/partition/v1/info
curl http://localhost:8080/api/partition/v1/info
```

```curl http://localhost:8080/api/partition/v1/info
{"groupId":"org.opengroup.osdu",...}
```

#### Test authenticated query

```
curl -H "Authorization: Bearer $(cat local-token)" http://localhost:8080/api/partition/v1/partitions                                                                                                                                        
```

```
[]
```

## Dev container

### Fix Dockerfile

Add lines before the first RUN line in `Dockerfile`:

```
RUN curl -fsSL https://dl.yarnpkg.com/debian/pubkey.gpg | sudo gpg --yes --dearmor -o /usr/share/keyrings/yarnkey.gpg

RUN echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/yarnkey.gpg] https://dl.yarnpkg.com/debian stable main" | sudo tee /etc/apt/sources.list.d/yarn.list > /dev/null
```

### Run container

In vscode, open the `app/sdms` as a project and reopen as devcontainer. 

Run shell commands in the next sections within the VSCode integrated terminal.

### Enable debugger

In vscode, run `Debug: Toggle Auto Attach` -> `Always`. You can then set breakpoints.

### Run SDMS

```
npm install
npm run build
npm run start
```

See [README.md](README.md) for additional commands that can be run.

### Fix AWS

If getting an error around `resolvedPath` in `aws-sdk`, delete all folders under `app/sdms/src/cloud/providers` except `azure`, and adapt `src/cloud/providers/index.ts` to remove all exports except `azure`.

## Access API

The API is documented at [adme-samples](https://microsoft.github.io/adme-samples/) (Seismic DDMS Service).

### Unauthenticated endpoint

The readiness endpoint can be accessed without authentication:

```
curl http://localhost:5000/seistore-svc/api/v3/svcstatus/readiness
```

```
{"ready":true}
```

### Authenticated endpoint

```
curl -H "Authorization: Bearer $(cat local-token)" http://localhost:5000/seistore-svc/api/v3/svcstatus/access
```

```
{"status":"running"}
```


## Work with partition data

#### Create a partition in Partition Server

*TODO: this requires additional properties for Cosmos DB config*

```
curl -v -H "Authorization: Bearer $(cat local-token)" 'http://localhost:8080/api/partition/v1/partitions/dp00' -H 'Content-Type: application/json' -d '{ "properties": { "compliance-ruleset": { "value": "shared" } } }'
```

#### List partition in SDMS

```
curl -H "Authorization: Bearer $(cat local-token)" -v 'http://localhost:5000/seistore-svc/api/v3/utility/ls?sdpath=sd://dp00'
```

