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
  name     = var.base_resource_name
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

resource "azurerm_log_analytics_workspace" "default" {
  name     = var.base_resource_name
  resource_group_name         = azurerm_resource_group.sdms.name
  location            = var.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_application_insights" "default" {
  name     = var.base_resource_name
  resource_group_name         = azurerm_resource_group.sdms.name
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
  name     = var.base_resource_name
  location                    = azurerm_resource_group.sdms.location
  resource_group_name         = azurerm_resource_group.sdms.name
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
  name     = var.base_resource_name
  location                    = azurerm_resource_group.sdms.location
  resource_group_name         = azurerm_resource_group.sdms.name
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
  name     = var.base_resource_name
  location                    = azurerm_resource_group.sdms.location
  resource_group_name         = azurerm_resource_group.sdms.name
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

output "config" {
  value = <<EOT
  # the central KeyVault, secret values used to seed AzureConfig
KEYVAULT_URL=${azurerm_key_vault.sdms.vault_uri}

# the service principal (SP) with right to access the previous keyvault
AZURE_CLIENT_ID=${azuread_service_principal.sdms.application_id}
AZURE_CLIENT_SECRET=${azuread_service_principal_password.sdms.value}
AZURE_TENANT_ID=${data.azurerm_client_config.current.tenant_id}
EOT
  sensitive = true
}

output "script_config" {
  value = <<EOT
export AZURE_TENANT_ID=${data.azurerm_client_config.current.tenant_id}
export AZURE_AD_APP_RESOURCE_ID=${azuread_service_principal.sdms.application_id}
export INTEGRATION_TESTER=${azuread_service_principal.sdms.application_id}
export AZURE_TESTER_SERVICEPRINCIPAL_SECRET=${azuread_service_principal_password.sdms.value}
EOT
  sensitive = true
}