targetScope = 'resourceGroup'

// ── Hub Additions ─────────────────────────────────────────────────────────────
// Deploy ONCE to RG-AI-DEMO (the shared platform RG from template 16).
// Creates the shared Container Apps Environment and the dedicated subnet on the
// existing VNet.  All per-app bicep files reference these resources by ID.
//
// Deploy with:
//   az deployment group create -g RG-AI-DEMO \
//     --template-file main-hub-additions.bicep \
//     --parameters main-hub-additions.bicepparam

@description('Azure region – should match the hub RG.')
param location string = resourceGroup().location

@description('Tags applied to created resources.')
param tags object = {}

// ── Existing VNet (from template 16) ─────────────────────────────────────────
@description('Existing VNet name (from template 16).')
param virtualNetworkName string = 'agent-vnet-test'

@description('Name for the new subnet for Container Apps.')
param containerAppsSubnetName string = 'snet-container-apps'

@description('Address prefix for the Container Apps subnet (/27 or larger, must not overlap existing subnets).')
param containerAppsSubnetPrefix string = '192.168.2.0/27'

// ── New: Log Analytics for the shared CAE ────────────────────────────────────
@description('Log Analytics workspace name for the shared CAE.')
param logAnalyticsWorkspaceName string = 'log-cae-shared'

// ── New: Shared Container Apps Environment ────────────────────────────────────
@description('Shared Container Apps Environment name.')
param containerAppsEnvironmentName string = 'cae-ai-demo'

// ── Existing VNet reference ───────────────────────────────────────────────────
resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' existing = {
  name: virtualNetworkName
}

resource containerAppsSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-09-01' = {
  name: containerAppsSubnetName
  parent: vnet
  properties: {
    addressPrefix: containerAppsSubnetPrefix
    delegations: [
      {
        name: 'Microsoft.App-environments'
        properties: {
          serviceName: 'Microsoft.App/environments'
        }
      }
    ]
  }
}

// ── Log Analytics ─────────────────────────────────────────────────────────────
resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  tags: tags
  properties: {
    retentionInDays: 30
    sku: { name: 'PerGB2018' }
  }
}

// ── Shared Container Apps Environment ─────────────────────────────────────────
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
      infrastructureSubnetId: containerAppsSubnet.id
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

// ── Outputs ───────────────────────────────────────────────────────────────────
output containerAppsEnvironmentId string = containerAppsEnvironment.id
output containerAppsEnvironmentName string = containerAppsEnvironment.name
output subnetId string = containerAppsSubnet.id
