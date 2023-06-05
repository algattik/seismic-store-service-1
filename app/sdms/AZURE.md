# Developing SDMS on Azure

## Dev container

### Fix Dockerfile

Add lines before the first RUN line in `Dockerfile`:

```
RUN curl -fsSL https://dl.yarnpkg.com/debian/pubkey.gpg | sudo gpg --yes --dearmor -o /usr/share/keyrings/yarnkey.gpg

RUN echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/yarnkey.gpg] https://dl.yarnpkg.com/debian stable main" | sudo tee /etc/apt/sources.list.d/yarn.list > /dev/null
```

### Run container

In vscode, open the `app/sdms` as a project and reopen as devcontainer. 

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
terraform output config 
````

Copy `app/sdms/docs/templates/.env-sample-azure` to `app/sdms/.env`, and update the values in the file with the output of  `terraform output config `.

## Debug

In vscode, run `Debug: Toggle Auto Attach` -> `Always`. You can then set breakpoints.

Run:

```
npm install
npm run build
npm run start
```

## Fix AWS

If getting an error around `resolvedPath` in `aws-sdk`, delete all folders under `app/sdms/src/cloud/providers` except `azure`, and adapt `src/cloud/providers/index.ts` to remove all exports except `azure`.
