targetScope = 'resourceGroup'

@description('Azure region for the virtual network.')
param location string

@description('Tags applied to created resources.')
param tags object = {}

@description('Virtual network name.')
param virtualNetworkName string

@description('Address space for the virtual network.')
param virtualNetworkAddressPrefix string

@description('Subnet name for private endpoints.')
param privateEndpointSubnetName string

@description('Address prefix for the private endpoint subnet.')
param privateEndpointSubnetAddressPrefix string

@description('Subnet name delegated to Azure Container Apps.')
param containerAppsInfrastructureSubnetName string

@description('Address prefix for the Azure Container Apps infrastructure subnet. Use /27 or larger for workload profiles environments.')
param containerAppsInfrastructureSubnetAddressPrefix string

resource virtualNetwork 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: virtualNetworkName
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        virtualNetworkAddressPrefix
      ]
    }
  }
}

resource privateEndpointSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-11-01' = {
  parent: virtualNetwork
  name: privateEndpointSubnetName
  properties: {
    addressPrefix: privateEndpointSubnetAddressPrefix
    privateEndpointNetworkPolicies: 'Disabled'
  }
}

resource containerAppsInfrastructureSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-11-01' = {
  parent: virtualNetwork
  name: containerAppsInfrastructureSubnetName
  properties: {
    addressPrefix: containerAppsInfrastructureSubnetAddressPrefix
    delegations: [
      {
        name: 'container-apps-environments'
        properties: {
          serviceName: 'Microsoft.App/environments'
        }
      }
    ]
  }
}

output virtualNetworkId string = virtualNetwork.id
output privateEndpointSubnetId string = privateEndpointSubnet.id
output containerAppsInfrastructureSubnetId string = containerAppsInfrastructureSubnet.id
