# CI CD pipeline

## Overview

The `ci cd pipeline` template for SDMS provides CI CD for seistore-svc.

## Requirements

In order to be able to use this pipeline it is needed to create next library groups:
1. R3MVP - OSDU
```
AGENT_POOL: Name of the build agent pool to be used.
SERVICE_CONNECTION_NAME: Azure Resource service connection (could be for any environment, is just a place holder).
```
2. R3MVP - ${{ provider }} Service Release - seistore-svc
Please replace ${{ provider }} with one of next values: Azure, GCP
```
e2eAdminEmail: Email account with admin permissions used by end to end test.
e2eDataPartition: DataPartition to be used by end to end test.
e2eIdToken: First token to be used by end to end test.
e2eIdToken: Second token to be used by end to end test.
e2eLegaltag01: First legaltag to be used by end to end test.
e2eLegaltag01: Second legaltag to be used by end to end test.
e2eNewUser: User email to test add a new user.
e2eProjectId: Project id of project to be used by end to end test.
e2eServiceId: First service id of service to be used by end to end test.
e2eServiceId1: Second service id of service to be used by end to end test.
e2eSubproject: Subproject name to be used by end to end test.
e2eSubprojectLongname: Subproject long name to be used by end to end test.
e2eTargetProjId: Target project id of project to be used by end to end test.
e2eTargetServiceId: Target service id of service to be used by end to end test.
e2eTenant: Tenant name to be used by end to end test.
PORT: Port where seistore-svc is going to listen (only used when flux enabled).
REPLICA_COUNT: Number of pod replicas (only used when flux enabled).  
serviceUrlSuffix: Url suffix where seistore-svc is listening, usually: seistore-svc/api/v3
utest.runtime.image: Name of container image, usually: seistore-svc-runtime
```
3. R3MVP - ${{ provider }} Target Env - ${{ environment }}
Please replace ${{ provider }} with one of next values: Azure, GCP
Please replace ${{ environment }} with name of environment. Please see Notes section.
```
cluster_name: Kubernetes cluster name (Used when flux is not enabled and GCP).
cluster_zone: Kubernetes cluster zone (Used when flux is not enabled and GCP).
CONTAINER_REGISTRY_NAME: Private container registry name. When using GCP is gcr.io.
container_registry_path: To provide subfolder in container registry.
DNS_HOST: Host/DNS name where entitlements service is.
ENVIRONMENT_NAME: Name of environment.
gcp_project: Provide gcp project name where kubernetes cluster is.
KEYVAULT_NAME: Azure keyvault name.
PROVIDER_NAME: Use one of next values: Azure, GCP
REDIS_HOST: Redis host name.
REDIS_PORT: Redis port.
secure_file_container_registry: Name of secure file for container registry connection (used only on GCP).
SERVICE_CONNECTION_NAME: Azure service connection with permissions to deploy to container registry (only used when provider is Azure).
```
## Secret files

1. GCP
```
secure_file_container_registry Secure file with connections to connect to container registry.
```

## Changes needed

1. Open devops/azure/pipeline.yml
2. Under build stage, add the providers. Example with both supported providers:
```
  - template: template/build-stage.yml
    parameters:
      serviceName: ${{ variables.serviceName }}
      providers:
	    -  name: GCP
		-  name: Azure
```
3. If flux is enabled in your cluster, in devops/azure/pipeline.yml add your repo and name it FluxRepo, then, in devops/azure/template/task/aks-deployment-steps.yml uncomment
```
    # - checkout: FluxRepo
      # persistCredentials: true
```
4. Under deploy stage, add the providers and environments. Example with 2 different providers:
```
  - template: template/deploy-stage.yml
    parameters:
      serviceName: ${{ variables.serviceName }}
      chartPath: ${{ variables.chartPath }}
      manifestRepo: ${{ variables.MANIFEST_REPO }}
      providers:
        -  name: GCP
           environments:
             - name: 'evt'
               fluxEnabled: false
               secureFile: evt-seistore-services.json
	    -  name: Azure
           environments: 
             - name: 'dev'
               fluxEnabled: true
             - name: 'qa'
               fluxEnabled: true
```

## Use pipeline

In pipelines create a new one and reference the pipeline to use devops/azure/pipeline.yml

## Notes

1. End to end (e2e) testing only happens in environments named: dev, qa, evd, and evt.

## License
Copyright © Microsoft Corporation

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

[http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0)

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
