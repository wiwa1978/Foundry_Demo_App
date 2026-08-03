targetScope = 'resourceGroup'

@description('Azure region for private endpoints.')
param location string

@description('Tags applied to created resources.')
param tags object = {}

@description('Virtual network resource ID linked to private DNS zones.')
param virtualNetworkId string

@description('Virtual network name used for private DNS link names.')
param virtualNetworkName string

@description('Subnet resource ID for private endpoints.')
param privateEndpointSubnetId string

@description('Storage account resource ID.')
param storageAccountId string

@description('Storage account name.')
param storageAccountName string

@description('Azure AI Search resource ID.')
param searchServiceId string

@description('Azure AI Search service name.')
param searchServiceName string

@description('Create a private endpoint and private DNS zone for Azure AI Search.')
param enableSearchPrivateEndpoint bool = false

var blobPrivateDnsZoneName = 'privatelink.blob.${environment().suffixes.storage}'
var searchPrivateDnsZoneName = 'privatelink.search.windows.net'

resource blobPrivateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: blobPrivateDnsZoneName
  location: 'global'
  tags: tags
}

resource blobPrivateDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: blobPrivateDnsZone
  name: '${virtualNetworkName}-blob-dns-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: virtualNetworkId
    }
  }
}

resource storagePrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: '${storageAccountName}-blob-pe'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: '${storageAccountName}-blob-connection'
        properties: {
          groupIds: [
            'blob'
          ]
          privateLinkServiceId: storageAccountId
        }
      }
    ]
  }
}

resource storagePrivateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: storagePrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'blob'
        properties: {
          privateDnsZoneId: blobPrivateDnsZone.id
        }
      }
    ]
  }
}

resource searchPrivateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = if (enableSearchPrivateEndpoint) {
  name: searchPrivateDnsZoneName
  location: 'global'
  tags: tags
}

resource searchPrivateDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = if (enableSearchPrivateEndpoint) {
  parent: searchPrivateDnsZone
  name: '${virtualNetworkName}-search-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: virtualNetworkId
    }
  }
}

resource searchPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = if (enableSearchPrivateEndpoint) {
  name: '${searchServiceName}-pe'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: '${searchServiceName}-connection'
        properties: {
          groupIds: [
            'searchService'
          ]
          privateLinkServiceId: searchServiceId
        }
      }
    ]
  }
}

resource searchPrivateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = if (enableSearchPrivateEndpoint) {
  parent: searchPrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'search'
        properties: {
          privateDnsZoneId: searchPrivateDnsZone.id
        }
      }
    ]
  }
}

output storagePrivateEndpointId string = storagePrivateEndpoint.id
output blobPrivateDnsZoneId string = blobPrivateDnsZone.id
output searchPrivateEndpointId string = enableSearchPrivateEndpoint ? searchPrivateEndpoint.id : ''
