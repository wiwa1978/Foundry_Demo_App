using './main-app-only.bicep'

// ── Deploy app-specific resources to a dedicated app RG ──────────────────────
// Prerequisites:
//   1. RG-AI-DEMO exists with template 16 resources (Foundry, Search, Storage, ACR, VNet)
//   2. main-hub-additions.bicep has been deployed to RG-AI-DEMO (creates shared CAE)
//
// Deploy with:
//   az group create -n RG-AI-DEMO-APP1 -l swedencentral
//   az deployment group create -g RG-AI-DEMO-APP1 \
//     --template-file main-app-only.bicep \
//     --parameters main-app-only.bicepparam

param location = 'swedencentral'
param tags = {
  workload: 'foundry-chat-app'
  scenario: 'document-rag'
}

// ── Shared hub resources (all in RG-AI-DEMO) ─────────────────────────────────
param sharedResourceGroupName         = 'RG-AI-DEMO'
param containerRegistryName           = 'acr66fb'
param storageAccountName              = 'aifoundrydemo66fbstorage'
param storageContainerName            = 'foundry-rag-documents'
param searchServiceName               = 'aifoundrydemo66fbsearch'
param searchIndexName                 = 'foundry-document-rag'
param foundryAccountName              = 'aifoundrydemo66fb'
param cosmosAccountName               = 'aifoundrydemo66fbcosmosdb'
param cosmosDatabaseName              = 'apps-db-shared'
param cosmosContainerName             = 'foundry-demo-app'

// Shared CAE resource ID (output from main-hub-additions.bicep)
param containerAppsEnvironmentId      = '/subscriptions/12aa5cea-1cef-4ce4-85f1-d890b5350326/resourceGroups/RG-AI-DEMO/providers/Microsoft.App/managedEnvironments/cae-ai-demo'

// ── App-specific resources (created in target app RG) ────────────────────────
param logAnalyticsWorkspaceName       = 'log-foundry-chat'
param containerAppName                = 'ca-foundry-chat'
param containerAppManagedIdentityName = 'id-ca-foundry-chat'
param containerImage                  = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

// ── App config ────────────────────────────────────────────────────────────────
param foundryProjectEndpoint  = 'https://aifoundrydemo66fb.services.ai.azure.com/api/projects/proj66fb'
param foundryOpenAiEndpoint   = ''
param foundryModels           = 'gpt-5.5'
param foundryEmbeddingModel   = 'text-embedding-3-small'
param foundryRealtimeEndpoint = ''
param foundryRealtimeModel    = 'gpt-realtime-2.1'

param enableEntraAuthentication = true
param entraAuthenticationClientId = ''
param entraAuthenticationClientSecret = ''
param entraAuthenticationTenantId = ''

param containerAppMinReplicas = 1
param containerAppMaxReplicas = 1
