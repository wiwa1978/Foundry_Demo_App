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

@description('Optional code-hosted Foundry agent name.')
param foundryHostedAgentName string = ''

@description('Optional Foundry OpenAI-compatible endpoint.')
param foundryOpenAiEndpoint string = ''

@description('Optional Foundry FLUX provider endpoint override.')
param foundryFluxEndpoint string = ''

@description('Comma-separated Foundry model deployment names.')
param foundryModels string

@description('Foundry embedding deployment name.')
param foundryEmbeddingModel string

@description('Optional Foundry realtime endpoint.')
param foundryRealtimeEndpoint string = ''

@description('Foundry realtime model deployment name.')
param foundryRealtimeModel string = 'gpt-realtime-2.1'

@description('Azure AI Speech resource endpoint for the Transcribe use case.')
param azureSpeechEndpoint string = ''

@secure()
@description('Azure AI Speech resource key for the Transcribe use case.')
param azureSpeechKey string = ''

@description('Shared Cosmos DB account endpoint.')
param cosmosEndpoint string

@description('Shared Cosmos DB for NoSQL database name.')
param cosmosDatabaseName string

@description('App-specific Cosmos DB container name.')
param cosmosContainerName string

@description('Enable Microsoft Entra sign-in through Azure Container Apps authentication.')
param enableEntraAuthentication bool = true

@description('Application client ID of the Entra app registration used by Container Apps authentication.')
param entraAuthenticationClientId string = ''

@secure()
@description('Client secret for the Entra app registration used by Container Apps authentication.')
param entraAuthenticationClientSecret string = ''

@description('Tenant ID for the Entra app registration used by Container Apps authentication.')
param entraAuthenticationTenantId string = ''

@description('Comma-separated administrator object IDs or email addresses.')
param adminPrincipals string = ''

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
var searchIndexDataReaderRoleId = '1407120a-92aa-4202-b7e9-c0e197c71c8f'
var searchIndexDataContributorRoleId = '8ebe5a00-799e-43f5-93ac-243d3dce84a7'
var searchServiceContributorRoleId = '7ca78c08-252a-4471-8644-bb5ff32d4ba0'
var cognitiveServicesUserRoleId = 'a97b65f3-24c7-4388-baec-2e87135dc908'
var cognitiveServicesOpenAiContributorRoleId = 'a001fd3d-188f-4b5d-821b-7da978bf7442'
var azureAiDeveloperRoleId = '64702f94-c441-49e6-a78b-ef80e0188fee'
var cognitiveServicesSpeechUserRoleId = 'f2dc8367-1007-4938-bd23-fe263f013447'
var entraAuthenticationSecretName = 'entra-auth-client-secret'

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
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      storageBlobDataContributorRoleId
    )
  }
}

resource searchIndexDataContributorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(searchService.id, managedIdentityName, searchIndexDataContributorRoleId)
  scope: searchService
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      searchIndexDataContributorRoleId
    )
  }
}

resource searchIndexDataReaderAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(searchService.id, managedIdentityName, searchIndexDataReaderRoleId)
  scope: searchService
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchIndexDataReaderRoleId)
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

resource foundryOpenAiContributorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryAccount.id, managedIdentityName, cognitiveServicesOpenAiContributorRoleId)
  scope: foundryAccount
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      cognitiveServicesOpenAiContributorRoleId
    )
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

resource foundrySpeechUserAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryAccount.id, managedIdentityName, cognitiveServicesSpeechUserRoleId)
  scope: foundryAccount
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      cognitiveServicesSpeechUserRoleId
    )
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
      secrets: concat(
        enableEntraAuthentication
          ? [
              {
                name: entraAuthenticationSecretName
                value: entraAuthenticationClientSecret
              }
            ]
          : [],
        !empty(azureSpeechKey)
          ? [
              {
                name: 'azure-speech-key'
                value: azureSpeechKey
              }
            ]
          : []
      )
    }
    template: {
      containers: [
        {
          name: 'foundry-chat-app'
          image: containerImage
          env: concat(
            [
              {
                name: 'AZURE_CLIENT_ID'
                value: appIdentity.properties.clientId
              }
              {
                name: 'PERSISTENCE_BACKEND'
                value: 'cosmos'
              }
              {
                name: 'APP_AUTH_MODE'
                value: enableEntraAuthentication ? 'container_apps' : 'disabled'
              }
              {
                name: 'APP_AUTH_TENANT_ID'
                value: entraAuthenticationTenantId
              }
              {
                name: 'ADMIN_PRINCIPALS'
                value: adminPrincipals
              }
              {
                name: 'FOUNDRY_PROJECT_ENDPOINT'
                value: foundryProjectEndpoint
              }
              {
                name: 'FOUNDRY_HOSTED_AGENT_NAME'
                value: foundryHostedAgentName
              }
              {
                name: 'FOUNDRY_OPENAI_ENDPOINT'
                value: foundryOpenAiEndpoint
              }
              {
                name: 'FOUNDRY_FLUX_ENDPOINT'
                value: foundryFluxEndpoint
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
              {
                name: 'AZURE_COSMOS_ENDPOINT'
                value: cosmosEndpoint
              }
              {
                name: 'AZURE_COSMOS_DATABASE_NAME'
                value: cosmosDatabaseName
              }
              {
                name: 'AZURE_COSMOS_CONTAINER_NAME'
                value: cosmosContainerName
              }
            ],
            !empty(azureSpeechEndpoint)
              ? [
                  {
                    name: 'AZURE_SPEECH_ENDPOINT'
                    value: azureSpeechEndpoint
                  }
                  {
                    name: 'AZURE_SPEECH_TRANSCRIPTION_MODEL'
                    value: 'MAI-Transcribe-1.5'
                  }
                ]
              : [],
            !empty(azureSpeechKey)
              ? [
                  {
                    name: 'AZURE_SPEECH_KEY'
                    secretRef: 'azure-speech-key'
                  }
                ]
              : []
          )
          resources: {
            cpu: json(containerCpu)
            memory: containerMemory
          }
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
    searchIndexDataReaderAssignment
    searchIndexDataContributorAssignment
    searchServiceContributorAssignment
    foundryUserAssignment
    foundryOpenAiContributorAssignment
    foundryAiDeveloperAssignment
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
        enabled: true
      }
    }
  }
}

output containerAppName string = containerApp.name
output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output managedIdentityClientId string = appIdentity.properties.clientId
output managedIdentityPrincipalId string = appIdentity.properties.principalId
