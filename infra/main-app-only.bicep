targetScope = 'resourceGroup'

// ── Per-App Deployment ────────────────────────────────────────────────────────
// Deploy to a dedicated app RG (e.g. RG-AI-DEMO-APP1).
// References all shared hub resources in sharedResourceGroupName cross-RG.
// The shared Container Apps Environment must already exist (deploy
// main-hub-additions.bicep to RG-AI-DEMO first).
//
// Deploy with:
//   az group create -n RG-AI-DEMO-APP1 -l swedencentral
//   az deployment group create -g RG-AI-DEMO-APP1 \
//     --template-file main-app-only.bicep \
//     --parameters main-app-only.bicepparam

@description('Azure region for new resources.')
param location string = resourceGroup().location

@description('Tags applied to created resources.')
param tags object = {}

// ── Hub references ────────────────────────────────────────────────────────────
@description('Resource group where shared hub resources live (template 16 + hub-additions).')
param sharedResourceGroupName string = 'RG-AI-DEMO'

@description('Existing ACR name in the hub RG.')
param containerRegistryName string

@description('Existing Storage account name in the hub RG.')
param storageAccountName string

@description('Blob container name for RAG uploads.')
param storageContainerName string = 'foundry-rag-documents'

@description('Existing AI Search service name in the hub RG.')
param searchServiceName string

@description('Azure AI Search index name.')
param searchIndexName string = 'foundry-document-rag'

@description('Existing Foundry account name in the hub RG.')
param foundryAccountName string

@description('Existing shared Cosmos DB account name in the hub RG.')
param cosmosAccountName string

@description('Existing shared Cosmos DB for NoSQL database name.')
param cosmosDatabaseName string

@description('App-specific Cosmos DB container name.')
param cosmosContainerName string = 'foundry-chat-app'

@description('Resource ID of the shared Container Apps Environment (from hub-additions output).')
param containerAppsEnvironmentId string

// ── Parameters: new resources (created in app RG) ─────────────────────────────
@description('Log Analytics workspace name (per-app, for app-level logs).')
param logAnalyticsWorkspaceName string

@description('Container App name.')
param containerAppName string

@description('User-assigned managed identity name for the Container App.')
param containerAppManagedIdentityName string

@description('Container image to run. Use placeholder until app image is pushed to ACR.')
param containerImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

// ── Parameters: app config ────────────────────────────────────────────────────
@description('Foundry project endpoint.')
param foundryProjectEndpoint string

@description('Optional code-hosted Foundry agent name.')
param foundryHostedAgentName string = ''

@description('Optional Foundry OpenAI-compatible endpoint override.')
param foundryOpenAiEndpoint string = ''

@description('Optional Foundry FLUX provider endpoint override.')
param foundryFluxEndpoint string = ''

@description('Comma-separated Foundry model deployment names.')
param foundryModels string

@description('Foundry embedding deployment name.')
param foundryEmbeddingModel string = 'text-embedding-3-small'

@description('Optional Foundry realtime endpoint override.')
param foundryRealtimeEndpoint string = ''

@description('Foundry realtime model deployment name.')
param foundryRealtimeModel string = 'gpt-realtime-2.1'

@description('Azure AI Speech resource endpoint for the Transcribe use case.')
param azureSpeechEndpoint string = ''

@secure()
@description('Azure AI Speech resource key for the Transcribe use case.')
param azureSpeechKey string = ''

@description('Enable Microsoft Entra sign-in through Azure Container Apps authentication.')
param enableEntraAuthentication bool = true

@description('Application client ID of the Entra app registration used by Container Apps authentication.')
param entraAuthenticationClientId string = ''

@secure()
@description('Client secret for the Entra app registration used by Container Apps authentication.')
param entraAuthenticationClientSecret string = ''

@description('Tenant ID for the Entra app registration used by Container Apps authentication.')
param entraAuthenticationTenantId string = ''

@description('Comma-separated administrator object IDs or email addresses. Use Entra object IDs in production. Empty denies all privileged operations when authentication is enabled.')
param adminPrincipals string = ''

@description('Minimum Container App replicas.')
param containerAppMinReplicas int = 1

@description('Maximum Container App replicas.')
param containerAppMaxReplicas int = 1

var entraAuthenticationSecretName = 'entra-auth-client-secret'

// ── Existing hub resource references (cross-RG) ───────────────────────────────
resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: containerRegistryName
  scope: resourceGroup(sharedResourceGroupName)
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
  scope: resourceGroup(sharedResourceGroupName)
}

resource searchService 'Microsoft.Search/searchServices@2023-11-01' existing = {
  name: searchServiceName
  scope: resourceGroup(sharedResourceGroupName)
}

// ── New: Log Analytics Workspace (per-app) ────────────────────────────────────
resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  tags: tags
  properties: {
    retentionInDays: 30
    sku: { name: 'PerGB2018' }
  }
}

// ── New: Managed Identity (per-app) ──────────────────────────────────────────
resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: containerAppManagedIdentityName
  location: location
  tags: tags
}

// ── RBAC: all roles on hub resources via module (cross-RG) ───────────────────
module rbacShared 'modules/rbac-shared.bicep' = {
  name: 'rbac-shared-${containerAppName}'
  scope: resourceGroup(sharedResourceGroupName)
  params: {
    principalId:            appIdentity.properties.principalId
    containerRegistryName:  containerRegistryName
    storageAccountName:     storageAccountName
    searchServiceName:      searchServiceName
    foundryAccountName:     foundryAccountName
  }
}

module cosmosShared 'modules/cosmos-shared.bicep' = {
  name: 'cosmos-shared-${containerAppName}'
  scope: resourceGroup(sharedResourceGroupName)
  params: {
    accountName: cosmosAccountName
    databaseName: cosmosDatabaseName
    containerName: cosmosContainerName
    principalId: appIdentity.properties.principalId
  }
}

// ── New: Container App ────────────────────────────────────────────────────────
resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${appIdentity.id}': {} }
  }
  properties: {
    environmentId: containerAppsEnvironmentId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: true
        targetPort: 8000
        transport: 'auto'
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: appIdentity.id
        }
      ]
      secrets: concat(
        enableEntraAuthentication ? [
          {
            name: entraAuthenticationSecretName
            value: entraAuthenticationClientSecret
          }
        ] : [],
        !empty(azureSpeechKey) ? [
          {
            name: 'azure-speech-key'
            value: azureSpeechKey
          }
        ] : []
      )
    }
    template: {
      containers: [
        {
          name: 'foundry-chat-app'
          image: containerImage
          env: concat([
            { name: 'AZURE_CLIENT_ID',              value: appIdentity.properties.clientId }
            { name: 'PERSISTENCE_BACKEND',           value: 'cosmos' }
            { name: 'APP_AUTH_MODE',                value: enableEntraAuthentication ? 'container_apps' : 'disabled' }
            { name: 'APP_AUTH_TENANT_ID',           value: entraAuthenticationTenantId }
            { name: 'ADMIN_PRINCIPALS',             value: adminPrincipals }
            { name: 'FOUNDRY_SUBSCRIPTION_ID',      value: subscription().subscriptionId }
            { name: 'FOUNDRY_RESOURCE_GROUP',       value: sharedResourceGroupName }
            { name: 'FOUNDRY_ACCOUNT_NAME',         value: foundryAccountName }
            { name: 'FOUNDRY_PROJECT_ENDPOINT',     value: foundryProjectEndpoint }
            { name: 'FOUNDRY_HOSTED_AGENT_NAME',   value: foundryHostedAgentName }
            { name: 'FOUNDRY_OPENAI_ENDPOINT',      value: foundryOpenAiEndpoint }
            { name: 'FOUNDRY_FLUX_ENDPOINT',        value: foundryFluxEndpoint }
            { name: 'FOUNDRY_MODELS',               value: foundryModels }
            { name: 'FOUNDRY_REALTIME_ENDPOINT',    value: empty(foundryRealtimeEndpoint) ? foundryProjectEndpoint : foundryRealtimeEndpoint }
            { name: 'FOUNDRY_REALTIME_MODEL',       value: foundryRealtimeModel }
            { name: 'AZURE_STORAGE_ACCOUNT_URL',    value: 'https://${storageAccount.name}.blob.${environment().suffixes.storage}' }
            { name: 'AZURE_STORAGE_CONTAINER_NAME', value: storageContainerName }
            { name: 'AZURE_SEARCH_ENDPOINT',        value: 'https://${searchService.name}.search.windows.net' }
            { name: 'AZURE_SEARCH_INDEX_NAME',      value: searchIndexName }
            { name: 'FOUNDRY_EMBEDDING_MODEL',      value: foundryEmbeddingModel }
            { name: 'AZURE_COSMOS_ENDPOINT',        value: cosmosShared.outputs.endpoint }
            { name: 'AZURE_COSMOS_DATABASE_NAME',   value: cosmosDatabaseName }
            { name: 'AZURE_COSMOS_CONTAINER_NAME',  value: cosmosContainerName }
          ], !empty(azureSpeechEndpoint) ? [
            { name: 'AZURE_SPEECH_ENDPOINT',        value: azureSpeechEndpoint }
            { name: 'AZURE_SPEECH_TRANSCRIPTION_MODEL', value: 'MAI-Transcribe-1.5' }
          ] : [], !empty(azureSpeechKey) ? [
            { name: 'AZURE_SPEECH_KEY',             secretRef: 'azure-speech-key' }
          ] : [])
          resources: { cpu: json('0.5'), memory: '1Gi' }
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/api/health', port: 8000 }
              initialDelaySeconds: 10
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: { path: '/api/ready', port: 8000 }
              initialDelaySeconds: 5
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: containerAppMinReplicas
        maxReplicas: containerAppMaxReplicas
        rules: [
          {
            name: 'http-scaling'
            http: { metadata: { concurrentRequests: '20' } }
          }
        ]
      }
    }
  }
  dependsOn: [
    rbacShared
  ]
}

resource authConfig 'Microsoft.App/containerApps/authConfigs@2024-03-01' = if (enableEntraAuthentication) {
  parent: containerApp
  name: 'current'
  properties: {
    platform: {
      enabled: true
      runtimeVersion: '~1'
    }
    globalValidation: {
      unauthenticatedClientAction: 'RedirectToLoginPage'
      redirectToProvider: 'azureactivedirectory'
    }
    httpSettings: {
      requireHttps: true
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        login: {
          loginParameters: [
            'prompt=select_account'
          ]
        }
        registration: {
          clientId: entraAuthenticationClientId
          clientSecretSettingName: entraAuthenticationSecretName
          openIdIssuer: uri(environment().authentication.loginEndpoint, '${entraAuthenticationTenantId}/v2.0')
        }
        validation: {
          allowedAudiences: [
            entraAuthenticationClientId
            'api://${entraAuthenticationClientId}'
          ]
        }
      }
    }
    login: {
      tokenStore: {
        enabled: false
      }
    }
  }
}

// ── Outputs ───────────────────────────────────────────────────────────
output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output containerAppName string = containerApp.name
output managedIdentityClientId string = appIdentity.properties.clientId
output managedIdentityPrincipalId string = appIdentity.properties.principalId
output acrLoginServer string = registry.properties.loginServer
