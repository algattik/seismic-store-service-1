variable "base_resource_name" {
  default = "agsdms"
}

variable "location" {
  default = "westeurope"
}

data "azuread_client_config" "current" {}

resource "azuread_application" "sdms" {
  display_name = var.base_resource_name
  owners       = [data.azuread_client_config.current.object_id]
}

resource "azuread_service_principal" "sdms" {
  application_id               = azuread_application.sdms.application_id
  app_role_assignment_required = false
  owners                       = [data.azuread_client_config.current.object_id]
}

resource "azuread_service_principal_password" "sdms" {
  service_principal_id = azuread_service_principal.sdms.id
}

provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy    = true
      recover_soft_deleted_key_vaults = true
    }
  }
}

data "azurerm_client_config" "current" {}

resource "azurerm_resource_group" "sdms" {
  name     = var.base_resource_name
  location = var.location
}

resource "azurerm_key_vault" "sdms" {
  name                        = var.base_resource_name
  location                    = azurerm_resource_group.sdms.location
  resource_group_name         = azurerm_resource_group.sdms.name
  enabled_for_disk_encryption = true
  tenant_id                   = data.azurerm_client_config.current.tenant_id
  soft_delete_retention_days  = 7
  purge_protection_enabled    = false

  sku_name = "standard"

  access_policy {
    tenant_id = data.azurerm_client_config.current.tenant_id
    object_id = data.azurerm_client_config.current.object_id

    secret_permissions = [
      "Backup", "Delete", "Get", "List", "Purge", "Recover", "Restore", "Set"
    ]

  }

  access_policy {
    tenant_id = data.azurerm_client_config.current.tenant_id
    object_id = azuread_service_principal.sdms.object_id

    secret_permissions = [
      "Get", "List"
    ]

  }
}

####

resource "azurerm_storage_account" "partition" {
  name                     = "${var.base_resource_name}ps"
  location                 = azurerm_resource_group.sdms.location
  resource_group_name      = azurerm_resource_group.sdms.name
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"
}

resource "azurerm_key_vault_secret" "tbl-storage" {
  name         = "tbl-storage"
  value        = azurerm_storage_account.partition.name
  key_vault_id = azurerm_key_vault.sdms.id
}

resource "azurerm_key_vault_secret" "tbl-storage-key" {
  name         = "tbl-storage-key"
  value        = azurerm_storage_account.partition.primary_access_key
  key_vault_id = azurerm_key_vault.sdms.id
}

resource "azurerm_key_vault_secret" "app-dev-sp-tenant-id" {
  name         = "app-dev-sp-tenant-id"
  value        = data.azurerm_client_config.current.tenant_id
  key_vault_id = azurerm_key_vault.sdms.id
}

resource "azurerm_key_vault_secret" "app-dev-sp-username" {
  name         = "app-dev-sp-username"
  value        = azuread_service_principal.sdms.application_id
  key_vault_id = azurerm_key_vault.sdms.id
}

resource "azurerm_key_vault_secret" "app-dev-sp-password" {
  name         = "app-dev-sp-password"
  value        = azuread_service_principal_password.sdms.value
  key_vault_id = azurerm_key_vault.sdms.id
}

resource "azurerm_key_vault_secret" "app-dev-sp-id" {
  name         = "app-dev-sp-id"
  value        = azuread_service_principal.sdms.application_id
  key_vault_id = azurerm_key_vault.sdms.id
}

####

resource "azurerm_log_analytics_workspace" "default" {
  name                = var.base_resource_name
  resource_group_name = azurerm_resource_group.sdms.name
  location            = var.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_application_insights" "default" {
  name                = var.base_resource_name
  resource_group_name = azurerm_resource_group.sdms.name
  location            = var.location
  workspace_id        = azurerm_log_analytics_workspace.default.id
  application_type    = "other"
}


resource "azurerm_key_vault_secret" "AI_INSTRUMENTATION_KEY" {
  name         = "appinsights-key"
  value        = azurerm_application_insights.default.instrumentation_key
  key_vault_id = azurerm_key_vault.sdms.id
}

resource "azurerm_redis_cache" "queue" {
  name                = var.base_resource_name
  location            = azurerm_resource_group.sdms.location
  resource_group_name = azurerm_resource_group.sdms.name
  capacity            = 0
  family              = "C"
  sku_name            = "Basic"
  minimum_tls_version = "1.2"
}

resource "azurerm_key_vault_secret" "REDIS_HOST" {
  name         = "redis-queue-hostname"
  value        = azurerm_redis_cache.queue.hostname
  key_vault_id = azurerm_key_vault.sdms.id
}

resource "azurerm_key_vault_secret" "REDIS_KEY" {
  name         = "redis-queue-password"
  value        = azurerm_redis_cache.queue.primary_access_key
  key_vault_id = azurerm_key_vault.sdms.id
}

resource "azurerm_key_vault_secret" "APP_RESOURCE_ID" {
  name         = "aad-client-id"
  value        = azuread_service_principal.sdms.application_id
  key_vault_id = azurerm_key_vault.sdms.id
}

resource "azurerm_storage_account" "sdms" {
  name                     = var.base_resource_name
  location                 = azurerm_resource_group.sdms.location
  resource_group_name      = azurerm_resource_group.sdms.name
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"
}

resource "azurerm_key_vault_secret" "DATA_PARTITION_STORAGE_ACCOUNT_NAME" {
  name         = "sdms-storage-account-name"
  value        = azurerm_storage_account.sdms.name
  key_vault_id = azurerm_key_vault.sdms.id
}

resource "azurerm_cosmosdb_account" "sdms" {
  name                = var.base_resource_name
  location            = azurerm_resource_group.sdms.location
  resource_group_name = azurerm_resource_group.sdms.name
  offer_type          = "Standard"

  consistency_policy {
    consistency_level       = "BoundedStaleness"
    max_interval_in_seconds = 300
    max_staleness_prefix    = 100000
  }

  geo_location {
    location          = var.location
    failover_priority = 0
  }
}

resource "azurerm_key_vault_secret" "DATA_PARTITION_COSMOS_ENDPOINT" {
  name         = "cosmos-endpoint"
  value        = azurerm_cosmosdb_account.sdms.endpoint
  key_vault_id = azurerm_key_vault.sdms.id
}

resource "azurerm_key_vault_secret" "DATA_PARTITION_COSMOS_PRIMARY_KEY" {
  name         = "cosmos-primary-key"
  value        = azurerm_cosmosdb_account.sdms.primary_key
  key_vault_id = azurerm_key_vault.sdms.id
}

resource "azurerm_key_vault_secret" "SERVICE_AUTH_PROVIDER_CREDENTIAL" {
  name         = "sdms-svc-auth-provider-credential"
  value        = azuread_service_principal_password.sdms.value
  key_vault_id = azurerm_key_vault.sdms.id
}

####

resource "azurerm_storage_share" "partition-server" {
  name                 = "sharename"
  storage_account_name = azurerm_storage_account.sdms.name
  quota                = 50
}

resource "azurerm_storage_share_file" "partition-server" {
  name             = "partition-server.jar"
  storage_share_id = azurerm_storage_share.partition-server.id
  source           = "partition-server.jar"
}

resource "azurerm_container_group" "partition-server" {
  name                = var.base_resource_name
  location            = azurerm_resource_group.sdms.location
  resource_group_name = azurerm_resource_group.sdms.name
  ip_address_type     = "Public"
  dns_name_label      = var.base_resource_name
  os_type             = "Linux"

  container {
    name   = "partition-server"
    image  = "openjdk:8-jdk-alpine"
    cpu    = "2"
    memory = "4"

    ports {
      port     = 8080
      protocol = "TCP"
    }

    environment_variables = {
      azure_istioauth_enabled = "false"
      aad_client_id           = azuread_service_principal.sdms.application_id
      KEYVAULT_URI            = azurerm_key_vault.sdms.vault_uri
      AZURE_CLIENT_ID         = azuread_service_principal.sdms.application_id
      AZURE_TENANT_ID         = data.azurerm_client_config.current.tenant_id
      REDIS_DATABASE          = "0"
      ENVIRONMENT             = "local"
      ACCEPT_HTTP = "true"
    }

    secure_environment_variables = {
      AZURE_CLIENT_SECRET = azuread_service_principal_password.sdms.value
      appinsights_key         = azurerm_application_insights.default.instrumentation_key
    }

    volume {
      name       = "app"
      mount_path = "/app"
      read_only  = true
      share_name = azurerm_storage_share.partition-server.name

      storage_account_name  = azurerm_storage_account.sdms.name
      storage_account_key   = azurerm_storage_account.sdms.primary_access_key
    }

    commands = [
      "sh",
      "-c",
      "java -Dspring.application.name=ps -Dspring.profiles.active=local -jar /app/partition-server.jar"
    ]

  }
}

#####

output "config" {
  # based on app/sdms/docs/templates/.env-sample-azure
  value     = <<EOT
# cloud provider is set to azure
CLOUDPROVIDER= "azure"

# the central KeyVault, secret values used to seed AzureConfig
KEYVAULT_URL=${azurerm_key_vault.sdms.vault_uri}

# the service principal (SP) with right to access the previous keyvault
AZURE_CLIENT_ID=${azuread_service_principal.sdms.application_id}
AZURE_CLIENT_SECRET=${azuread_service_principal_password.sdms.value}
AZURE_TENANT_ID=${data.azurerm_client_config.current.tenant_id}

# specify service port, default is 5000
PORT=5000

# e.g. 'evd'
APP_ENVIRONMENT_IDENTIFIER=local

# redis default port (osdu default 6380)
REDIS_INSTANCE_PORT=${azurerm_redis_cache.queue.ssl_port}

# DataEcosystem deployment URL (example https://evd.osdu.cloud.com")
DES_SERVICE_HOST=http://${azurerm_container_group.partition-server.fqdn}

# Features to disable ONLY the service run locally
FEATURE_FLAG_TRACE="true"
FEATURE_FLAG_LOGGING="true"
FEATURE_FLAG_STACKDRIVER_EXPORTER="false"
EOT
  sensitive = true
}

output "script_config" {
  value     = <<EOT
export AZURE_TENANT_ID=${data.azurerm_client_config.current.tenant_id}
export AZURE_AD_APP_RESOURCE_ID=${azuread_service_principal.sdms.application_id}
export INTEGRATION_TESTER=${azuread_service_principal.sdms.application_id}
export AZURE_TESTER_SERVICEPRINCIPAL_SECRET=${azuread_service_principal_password.sdms.value}

export ACI_PARTITION_SERVER=http://${azurerm_container_group.partition-server.fqdn}
EOT
  sensitive = true
}
