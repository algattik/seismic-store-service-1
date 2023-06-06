# Developing SDMS on Azure

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

## Populate Azure resources

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
````

## Debug

In vscode, run `Debug: Toggle Auto Attach` -> `Always`. You can then set breakpoints.

Run:

```
npm install
npm run build
npm run start
```

See [README.md](README.md) for additional commands that can be run.

## Fix AWS

If getting an error around `resolvedPath` in `aws-sdk`, delete all folders under `app/sdms/src/cloud/providers` except `azure`, and adapt `src/cloud/providers/index.ts` to remove all exports except `azure`.

## Access API

### Unauthenticated endpoint

The readiness endpoint can be accessed without authentication:

```
curl http://localhost:5000/seistore-svc/api/v3/svcstatus/readiness
```

```
{"ready":true}
```

### Generate Token

The codebase contains a Python script to generate a token.

Install required Python libraries:

```
sudo apt-get install -y python3-pip
pip3 install msal
```

Generate Python script configuration:

```
terraform output -raw script_config > local-config.sh
source local-config.sh
```

Run Python script:

```
python3 ../../devops/scripts/azure_jwt_client.py > local-token
```

### Use Token

TODO: does not work

```
curl -H "Authorization: Bearer $(cat local-token)" -v http://localhost:5000/seistore-svc/api/v3/tenant/gtc
```

```
Cannot read property 'status' of undefined
```



