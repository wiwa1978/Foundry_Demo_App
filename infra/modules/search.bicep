targetScope = 'resourceGroup'

@description('Azure region for Azure AI Search.')
param location string

@description('Tags applied to created resources.')
param tags object = {}

@description('Azure AI Search service name.')
param searchServiceName string

@description('Azure AI Search SKU.')
param searchSkuName string

@description('Public network access setting for Azure AI Search.')
@allowed([
  'enabled'
  'disabled'
])
param publicNetworkAccess string

resource searchService 'Microsoft.Search/searchServices@2023-11-01' = {
  name: searchServiceName
  location: location
  tags: tags
  sku: {
    name: searchSkuName
  }
  properties: {
    disableLocalAuth: false
    hostingMode: 'default'
    partitionCount: 1
    publicNetworkAccess: publicNetworkAccess
    replicaCount: 1
  }
}

output searchServiceId string = searchService.id
output searchEndpoint string = 'https://${searchService.name}.search.windows.net'
