targetScope = 'subscription'

@description('Azure region for all resources.')
param location string

@description('Resource group that will contain the RAG infrastructure.')
param resourceGroupName string

@description('Tags applied to created resources.')
param tags object = {}

@description('Storage account name for original uploaded documents. Must be globally unique, 3-24 lowercase letters and numbers.')
param storageAccountName string

@description('Blob container name for original uploaded documents.')
param storageContainerName string = 'foundry-rag-documents'

@description('Storage account SKU.')
@allowed([
  'Standard_LRS'
  'Standard_GRS'
  'Standard_RAGRS'
  'Standard_ZRS'
  'Standard_GZRS'
  'Standard_RAGZRS'
])
param storageSkuName string = 'Standard_LRS'

@description('Public network access setting for the storage account. Use Disabled when private endpoint-only access is required.')
@allowed([
  'Enabled'
  'Disabled'
])
param storagePublicNetworkAccess string = 'Disabled'

@description('Virtual network name used for private endpoint connectivity.')
param virtualNetworkName string

@description('Address space for the virtual network.')
param virtualNetworkAddressPrefix string = '10.40.0.0/16'

@description('Subnet name for private endpoints.')
param privateEndpointSubnetName string

@description('Address prefix for the private endpoint subnet.')
param privateEndpointSubnetAddressPrefix string = '10.40.1.0/24'

@description('Subnet name delegated to Azure Container Apps.')
param containerAppsInfrastructureSubnetName string = 'snet-container-apps'

@description('Address prefix for the Azure Container Apps infrastructure subnet. Use /27 or larger for workload profiles environments.')
param containerAppsInfrastructureSubnetAddressPrefix string = '10.40.2.0/27'

@description('Azure AI Search service name for document chunk and vector retrieval.')
param searchServiceName string

@description('Azure AI Search SKU.')
@allowed([
  'free'
  'basic'
  'standard'
  'standard2'
  'standard3'
  'storage_optimized_l1'
  'storage_optimized_l2'
])
param searchSkuName string = 'basic'

@description('Azure AI Search index name used by the app. The app creates the index on first upload.')
param searchIndexName string = 'foundry-document-rag'

@description('Public network access setting for Azure AI Search. Keep Enabled for local demos unless your runtime is inside the VNet.')
@allowed([
  'enabled'
  'disabled'
])
param searchPublicNetworkAccess string = 'enabled'

@description('Create a private endpoint and private DNS zone for Azure AI Search. Usually false for local demos.')
param enableSearchPrivateEndpoint bool = false

@description('Object ID of a user, group, service principal, or managed identity that should receive app data-plane roles. Leave empty to skip RBAC assignments.')
param principalId string = ''

@description('Principal type for RBAC assignments.')
@allowed([
  'User'
  'Group'
  'ServicePrincipal'
])
param principalType string = 'User'

@description('Assign Storage Blob Data Contributor, Search Index Data Contributor, and Search Service Contributor to principalId.')
param assignRagRoles bool = false

@description('Azure Container Registry name. Must be globally unique and use only letters and numbers.')
param containerRegistryName string

@description('Azure Container Registry SKU.')
@allowed([
  'Basic'
  'Standard'
  'Premium'
])
param containerRegistrySku string = 'Basic'

@description('Log Analytics workspace name for Container Apps logs.')
param logAnalyticsWorkspaceName string

@description('Container Apps managed environment name.')
param containerAppsEnvironmentName string

@description('Container App name. One app serves both frontend and backend for demo simplicity.')
param containerAppName string

@description('User-assigned managed identity name for the Container App.')
param containerAppManagedIdentityName string

@description('Container image to run. Default is a public placeholder; run infra\\build-and-deploy-image.ps1 after deployment to publish this app image.')
param containerImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Foundry project endpoint.')
param foundryProjectEndpoint string

@description('Optional Foundry OpenAI-compatible endpoint.')
param foundryOpenAiEndpoint string = ''

@description('Comma-separated Foundry model deployment names.')
param foundryModels string

@description('Foundry embedding deployment name.')
param foundryEmbeddingModel string = 'text-embedding-3-small'

@description('Optional Foundry realtime endpoint.')
param foundryRealtimeEndpoint string = ''

@description('Foundry realtime model deployment name.')
param foundryRealtimeModel string = 'gpt-realtime-2.1'

@description('Minimum number of Container App replicas.')
param containerAppMinReplicas int = 1

@description('Maximum number of Container App replicas.')
param containerAppMaxReplicas int = 1

resource rg 'Microsoft.Resources/resourceGroups@2022-09-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module network 'modules/network.bicep' = {
  name: 'network-${uniqueString(resourceGroupName, virtualNetworkName)}'
  scope: resourceGroup(resourceGroupName)
  params: {
    location: location
    tags: tags
    virtualNetworkName: virtualNetworkName
    virtualNetworkAddressPrefix: virtualNetworkAddressPrefix
    privateEndpointSubnetName: privateEndpointSubnetName
    privateEndpointSubnetAddressPrefix: privateEndpointSubnetAddressPrefix
    containerAppsInfrastructureSubnetName: containerAppsInfrastructureSubnetName
    containerAppsInfrastructureSubnetAddressPrefix: containerAppsInfrastructureSubnetAddressPrefix
  }
  dependsOn: [
    rg
  ]
}

module storage 'modules/storage.bicep' = {
  name: 'storage-${uniqueString(resourceGroupName, storageAccountName)}'
  scope: resourceGroup(resourceGroupName)
  params: {
    location: location
    tags: tags
    storageAccountName: storageAccountName
    storageContainerName: storageContainerName
    storageSkuName: storageSkuName
    publicNetworkAccess: storagePublicNetworkAccess
  }
  dependsOn: [
    rg
  ]
}

module search 'modules/search.bicep' = {
  name: 'search-${uniqueString(resourceGroupName, searchServiceName)}'
  scope: resourceGroup(resourceGroupName)
  params: {
    location: location
    tags: tags
    searchServiceName: searchServiceName
    searchSkuName: searchSkuName
    publicNetworkAccess: searchPublicNetworkAccess
  }
  dependsOn: [
    rg
  ]
}

module registry 'modules/container-registry.bicep' = {
  name: 'registry-${uniqueString(resourceGroupName, containerRegistryName)}'
  scope: resourceGroup(resourceGroupName)
  params: {
    location: location
    tags: tags
    containerRegistryName: containerRegistryName
    containerRegistrySku: containerRegistrySku
  }
  dependsOn: [
    rg
  ]
}

module privateEndpoints 'modules/private-endpoints.bicep' = {
  name: 'private-endpoints-${uniqueString(resourceGroupName, storageAccountName, searchServiceName)}'
  scope: resourceGroup(resourceGroupName)
  params: {
    location: location
    tags: tags
    virtualNetworkId: network.outputs.virtualNetworkId
    virtualNetworkName: virtualNetworkName
    privateEndpointSubnetId: network.outputs.privateEndpointSubnetId
    storageAccountId: storage.outputs.storageAccountId
    storageAccountName: storageAccountName
    searchServiceId: search.outputs.searchServiceId
    searchServiceName: searchServiceName
    enableSearchPrivateEndpoint: enableSearchPrivateEndpoint
  }
}

module containerApp 'modules/container-app.bicep' = {
  name: 'container-app-${uniqueString(resourceGroupName, containerAppName)}'
  scope: resourceGroup(resourceGroupName)
  params: {
    location: location
    tags: tags
    logAnalyticsWorkspaceName: logAnalyticsWorkspaceName
    containerAppsEnvironmentName: containerAppsEnvironmentName
    containerAppName: containerAppName
    managedIdentityName: containerAppManagedIdentityName
    infrastructureSubnetId: network.outputs.containerAppsInfrastructureSubnetId
    containerRegistryName: containerRegistryName
    containerRegistryLoginServer: registry.outputs.loginServer
    containerImage: containerImage
    storageAccountName: storageAccountName
    storageContainerName: storageContainerName
    searchServiceName: searchServiceName
    searchEndpoint: search.outputs.searchEndpoint
    searchIndexName: searchIndexName
    foundryProjectEndpoint: foundryProjectEndpoint
    foundryOpenAiEndpoint: foundryOpenAiEndpoint
    foundryModels: foundryModels
    foundryEmbeddingModel: foundryEmbeddingModel
    foundryRealtimeEndpoint: foundryRealtimeEndpoint
    foundryRealtimeModel: foundryRealtimeModel
    minReplicas: containerAppMinReplicas
    maxReplicas: containerAppMaxReplicas
  }
}

module rbac 'modules/rbac.bicep' = {
  name: 'rag-rbac-${uniqueString(resourceGroupName, principalId)}'
  scope: resourceGroup(resourceGroupName)
  params: {
    storageAccountName: storageAccountName
    searchServiceName: searchServiceName
    principalId: principalId
    principalType: principalType
    assignRagRoles: assignRagRoles
  }
  dependsOn: [
    storage
    search
  ]
}

output storageAccountUrl string = storage.outputs.blobEndpoint
output storageContainerName string = storageContainerName
output searchEndpoint string = search.outputs.searchEndpoint
output searchIndexName string = searchIndexName
output privateEndpointSubnetId string = network.outputs.privateEndpointSubnetId
output containerRegistryLoginServer string = registry.outputs.loginServer
output containerAppUrl string = containerApp.outputs.containerAppUrl
output containerAppManagedIdentityPrincipalId string = containerApp.outputs.managedIdentityPrincipalId
output appEnvValues string = '''
AZURE_STORAGE_ACCOUNT_URL=${storage.outputs.blobEndpoint}
AZURE_STORAGE_CONTAINER_NAME=${storageContainerName}
AZURE_SEARCH_ENDPOINT=${search.outputs.searchEndpoint}
AZURE_SEARCH_INDEX_NAME=${searchIndexName}
FOUNDRY_EMBEDDING_MODEL=${foundryEmbeddingModel}
'''
