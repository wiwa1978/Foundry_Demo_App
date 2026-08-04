using './main-hub-additions.bicep'

// Deploy with:
//   az deployment group create -g RG-AI-DEMO \
//     --template-file main-hub-additions.bicep \
//     --parameters main-hub-additions.bicepparam

param location                  = 'swedencentral'
param tags = {
  workload: 'shared-platform'
  scenario: 'hub'
}
param virtualNetworkName        = 'agent-vnet-test'
param containerAppsSubnetName   = 'snet-container-apps'
param containerAppsSubnetPrefix = '192.168.2.0/27'
param logAnalyticsWorkspaceName = 'log-cae-shared'
param containerAppsEnvironmentName = 'cae-ai-demo'
