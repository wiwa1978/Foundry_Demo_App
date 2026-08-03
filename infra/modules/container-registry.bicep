targetScope = 'resourceGroup'

@description('Azure region for the container registry.')
param location string

@description('Tags applied to created resources.')
param tags object = {}

@description('Azure Container Registry name. Must be globally unique and use only letters and numbers.')
param containerRegistryName string

@description('Azure Container Registry SKU.')
@allowed([
  'Basic'
  'Standard'
  'Premium'
])
param containerRegistrySku string = 'Basic'

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: containerRegistryName
  location: location
  tags: tags
  sku: {
    name: containerRegistrySku
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

output registryId string = registry.id
output loginServer string = registry.properties.loginServer
