<!--- Configmap -->

# Configmap helm chart

## Introduction

This chart bootstraps a configmap deployment on a [Kubernetes](https://kubernetes.io) cluster using [Helm](https://helm.sh) package manager.

## Prerequisites

The code was tested on **Kubernetes cluster** (v1.21.11) with **Istio** (1.12.6)
> It is possible to use other versions, but it hasn't been tested

### Operation system

The code works in Debian-based Linux (Debian 10 and Ubuntu 20.04) and Windows WSL 2. Also, it works but is not guaranteed in Google Cloud Shell. All other operating systems, including macOS, are not verified and supported.

### Packages

Packages are only needed for installation from a local computer.

* **HELM** (version: v3.7.1 or higher) [helm](https://helm.sh/docs/intro/install/)
* **Kubectl** (version: v1.21.0 or higher) [kubectl](https://kubernetes.io/docs/tasks/tools/#kubectl)

## Installation

First you need to set variables in **values.yaml** file using any code editor. Some of the values are prefilled, but you need to specify some values as well. You can find more information about them below.

### Common variables

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|---------|
**logLevel** | logging level | string | "ERROR" | yes
**cloudProvider** | cloud provider | string | "google" | yes
**port** | port | string | "5000" | yes
**desServiceHost** | base url of host | string | "https://des" | yes
**partitionHost** | partition service endpoint | string | "http://partition" | yes
**entitlementBaseUrlPath** | url path for entitlements | string | "/entitlements/v2" | yes
**dataPartitionRestHeaderKey** | REST header key for data partition | string | "data-partition-id" | yes
**storageHost** | storage service endpoint | string | "http://storage" | yes
**legalHost** | legal service endpoint | string | "http://legal" | yes
**appEnvironmentIdentifier** | app environment | string | "dev" | yes
**entitlementsHost** | entitlements service endpoint | string | "http://entitlements" | yes
**redisDdmsHost** |  redis instance address | string| "redis-cache-ddms.redis.svc.cluster.local" | yes
**redisPort** | redis instance port | string | "6379" | yes
**urlPrefix** | url prefix for seismic-store | string | "/api/seismic-store/v3" | yes

### GCP variables

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|---------|
**impServiceAccountSigner** | imp SA signer | string | "NA" | yes
**seistoreDesAppkey** | seismic-store app key | string | "NA" | yes
**serviceCloudProject** | project ID of service | string | - | yes
**googleAudiences** | your GCP client ID | string | - | yes

### On-prem variables

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|---------|
**apiBasePath** | base api url path | string | "/api/v3" | yes
**serviceEnv** | service environment | string | "dev" | yes

### Config variables

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|---------|
**appName** | name of the app | string | "seismic-store" | yes
**configmap** | configmap to be used | string | "seismic-store-config" | yes
**onPremEnabled** | whether on-prem is enabled | boolean | false | yes

### Install the helm chart

Run this command from within this directory:

```console
helm install gcp-seismic-store-sdms-configmap .
```

## Uninstalling the Chart

To uninstall the helm deployment:

```console
helm uninstall gcp-seismic-store-sdms-configmap
```

[Move-to-Top](#configmap-helm-chart)
