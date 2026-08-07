using './main.bicep'

param location = 'swedencentral'
param resourceGroupName = 'RG-AI-CUSTOMERS-DEMO'
param tags = {
  workload: 'foundry-chat-app'
  scenario: 'document-rag'
}

param storageAccountName = 'storaicustomersdemo'
param storageContainerName = 'foundry-documents'
param storageSkuName = 'Standard_LRS'
param storagePublicNetworkAccess = 'Disabled'

param virtualNetworkName = 'vnet-ai-customers-demo'
param virtualNetworkAddressPrefix = '10.40.0.0/16'
param privateEndpointSubnetName = 'pe-stor-ai-customers-demo'
param privateEndpointSubnetAddressPrefix = '10.40.1.0/24'
param containerAppsInfrastructureSubnetName = 'snet-container-apps'
param containerAppsInfrastructureSubnetAddressPrefix = '10.40.2.0/27'

param searchServiceName = 'srch-ai-customers-demo'
param searchSkuName = 'basic'
param searchIndexName = 'foundry-document-rag'
param searchPublicNetworkAccess = 'enabled'
param enableSearchPrivateEndpoint = false

param principalId = ''
param principalType = 'User'
param assignRagRoles = false

param containerRegistryName = 'acraicustomersdemo'
param containerRegistrySku = 'Basic'
param logAnalyticsWorkspaceName = 'log-ai-customers-demo'
param containerAppsEnvironmentName = 'cae-ai-customers-demo'
param containerAppName = 'ca-foundry-chat-demo'
param containerAppManagedIdentityName = 'id-ca-foundry-chat-demo'
param containerImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
param foundryAccountName = 'ai-customers-demo-resource'
param foundryProjectEndpoint = 'https://ai-customers-demo-resource.services.ai.azure.com/api/projects/ai-customers-demo'
param foundryModels = 'gpt-5.5,Kimi-K2.5,gpt-5.6-terra'
param foundryEmbeddingModel = 'text-embedding-3-small'
param foundryRealtimeEndpoint = 'https://ai-customers-demo-resource.services.ai.azure.com/api/projects/ai-customers-demo'
param foundryRealtimeModel = 'gpt-realtime-2.1'
param cosmosResourceGroupName = '<shared-cosmos-resource-group>'
param cosmosAccountName = '<shared-cosmos-account-name>'
param cosmosDatabaseName = '<shared-cosmos-database-name>'
param cosmosContainerName = 'foundry-chat-app'
// Prefer immutable Microsoft Entra object IDs. Empty denies privileged operations.
param adminPrincipals = ''
param containerAppMinReplicas = 1
param containerAppMaxReplicas = 1
