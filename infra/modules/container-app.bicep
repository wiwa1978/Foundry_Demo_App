targetScope = 'resourceGroup'

@description('Azure region for Azure Container Apps.')
param location string

@description('Tags applied to created resources.')
param tags object = {}

@description('Log Analytics workspace name.')
param logAnalyticsWorkspaceName string

@description('Container Apps managed environment name.')
param containerAppsEnvironmentName string

@description('Container App name.')
param containerAppName string

@description('User-assigned managed identity name for the Container App.')
param managedIdentityName string

@description('Container Apps infrastructure subnet ID.')
param infrastructureSubnetId string

@description('Container registry name.')
param containerRegistryName string

@description('Container registry login server.')
param containerRegistryLoginServer string

@description('Container image to run. Use a public placeholder for first deployment, then update after pushing to ACR.')
param containerImage string

@description('Storage account name for RAG uploads.')
param storageAccountName string

@description('Storage container name for RAG uploads.')
param storageContainerName string

@description('Azure AI Search service name.')
param searchServiceName string

@description('Azure AI Search endpoint.')
param searchEndpoint string

@description('Azure AI Search index name.')
param searchIndexName string

@description('Existing Azure AI Foundry / Azure AI services account name.')
param foundryAccountName string

@description('Foundry project endpoint.')
param foundryProjectEndpoint string

@description('Optional Foundry OpenAI-compatible endpoint.')
param foundryOpenAiEndpoint string = ''

@description('Comma-separated Foundry model deployment names.')
param foundryModels string

@description('Foundry embedding deployment name.')
param foundryEmbeddingModel string

@description('Optional Foundry realtime endpoint.')
param foundryRealtimeEndpoint string = ''

@description('Foundry realtime model deployment name.')
param foundryRealtimeModel string = 'gpt-realtime-2.1'

@description('Minimum number of Container App replicas.')
param minReplicas int = 1

@description('Maximum number of Container App replicas.')
param maxReplicas int = 1

@description('Container CPU allocation.')
param containerCpu string = '0.5'

@description('Container memory allocation.')
param containerMemory string = '1Gi'

var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var searchIndexDataContributorRoleId = '8ebe5a00-799e-43f5-93ac-243d3dce84a7'
var searchServiceContributorRoleId = '7ca78c08-252a-4471-8644-bb5ff32d4ba0'
var cognitiveServicesUserRoleId = 'a97b65f3-24c7-4388-baec-2e87135dc908'
var cognitiveServicesOpenAiUserRoleId = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
var azureAiDeveloperRoleId = '64702f94-c441-49e6-a78b-ef80e0188fee'

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  tags: tags
  properties: {
    retentionInDays: 30
    sku: {
      name: 'PerGB2018'
    }
  }
}

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppsEnvironmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace.properties.customerId
        sharedKey: workspace.listKeys().primarySharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: infrastructureSubnetId
      internal: false
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: managedIdentityName
  location: location
  tags: tags
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: containerRegistryName
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource searchService 'Microsoft.Search/searchServices@2023-11-01' existing = {
  name: searchServiceName
}

resource foundryAccount 'Microsoft.CognitiveServices/accounts@2023-05-01' existing = {
  name: foundryAccountName
}

resource acrPullAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, managedIdentityName, acrPullRoleId)
  scope: registry
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
  }
}

resource storageBlobDataContributorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, managedIdentityName, storageBlobDataContributorRoleId)
  scope: storageAccount
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
  }
}

resource searchIndexDataContributorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(searchService.id, managedIdentityName, searchIndexDataContributorRoleId)
  scope: searchService
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchIndexDataContributorRoleId)
  }
}

resource searchServiceContributorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(searchService.id, managedIdentityName, searchServiceContributorRoleId)
  scope: searchService
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchServiceContributorRoleId)
  }
}

resource foundryUserAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryAccount.id, managedIdentityName, cognitiveServicesUserRoleId)
  scope: foundryAccount
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleId)
  }
}

resource foundryOpenAiUserAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryAccount.id, managedIdentityName, cognitiveServicesOpenAiUserRoleId)
  scope: foundryAccount
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesOpenAiUserRoleId)
  }
}

resource foundryAiDeveloperAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryAccount.id, managedIdentityName, azureAiDeveloperRoleId)
  scope: foundryAccount
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', azureAiDeveloperRoleId)
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${appIdentity.id}': {}
    }
  }
  properties: {
    environmentId: containerAppsEnvironment.id
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
          server: containerRegistryLoginServer
          identity: appIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'foundry-chat-app'
          image: containerImage
          env: [
            {
              name: 'AZURE_CLIENT_ID'
              value: appIdentity.properties.clientId
            }
            {
              name: 'FOUNDRY_PROJECT_ENDPOINT'
              value: foundryProjectEndpoint
            }
            {
              name: 'FOUNDRY_OPENAI_ENDPOINT'
              value: foundryOpenAiEndpoint
            }
            {
              name: 'FOUNDRY_MODELS'
              value: foundryModels
            }
            {
              name: 'FOUNDRY_REALTIME_ENDPOINT'
              value: empty(foundryRealtimeEndpoint) ? foundryProjectEndpoint : foundryRealtimeEndpoint
            }
            {
              name: 'FOUNDRY_REALTIME_MODEL'
              value: foundryRealtimeModel
            }
            {
              name: 'AZURE_STORAGE_ACCOUNT_URL'
              value: 'https://${storageAccount.name}.blob.${environment().suffixes.storage}'
            }
            {
              name: 'AZURE_STORAGE_CONTAINER_NAME'
              value: storageContainerName
            }
            {
              name: 'AZURE_SEARCH_ENDPOINT'
              value: searchEndpoint
            }
            {
              name: 'AZURE_SEARCH_INDEX_NAME'
              value: searchIndexName
            }
            {
              name: 'FOUNDRY_EMBEDDING_MODEL'
              value: foundryEmbeddingModel
            }
          ]
          resources: {
            cpu: json(containerCpu)
            memory: containerMemory
          }
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '20'
              }
            }
          }
        ]
      }
    }
  }
  dependsOn: [
    acrPullAssignment
    storageBlobDataContributorAssignment
    searchIndexDataContributorAssignment
    searchServiceContributorAssignment
    foundryUserAssignment
    foundryOpenAiUserAssignment
    foundryAiDeveloperAssignment
  ]
}

output containerAppName string = containerApp.name
output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output managedIdentityClientId string = appIdentity.properties.clientId
output managedIdentityPrincipalId string = appIdentity.properties.principalId
