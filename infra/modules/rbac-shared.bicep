// modules/rbac-shared.bicep
// Deploys RBAC assignments ON shared hub resources for a given principal.
// Must be called as a module with scope: resourceGroup(sharedResourceGroupName).

targetScope = 'resourceGroup'

@description('Principal ID (object ID) of the managed identity to grant roles to.')
param principalId string

@description('ACR resource name in this RG.')
param containerRegistryName string

@description('Storage account resource name in this RG.')
param storageAccountName string

@description('AI Search service name in this RG.')
param searchServiceName string

@description('Foundry (CognitiveServices) account name in this RG.')
param foundryAccountName string

var acrPullRoleId                     = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var storageBlobDataContributorRoleId  = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var searchIndexDataReaderRoleId       = '1407120a-92aa-4202-b7e9-c0e197c71c8f'
var searchIndexDataContributorRoleId  = '8ebe5a00-799e-43f5-93ac-243d3dce84a7'
var searchServiceContributorRoleId    = '7ca78c08-252a-4471-8644-bb5ff32d4ba0'
var cognitiveServicesUserRoleId       = 'a97b65f3-24c7-4388-baec-2e87135dc908'
var cognitiveServicesOpenAiUserRoleId = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
var azureAiDeveloperRoleId            = '64702f94-c441-49e6-a78b-ef80e0188fee'
var cognitiveServicesSpeechUserRoleId = 'f2dc8367-1007-4938-bd23-fe263f013447'

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

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, principalId, acrPullRoleId)
  scope: registry
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
  }
}

resource storageBlobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, principalId, storageBlobDataContributorRoleId)
  scope: storageAccount
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
  }
}

resource searchIndexDataReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(searchService.id, principalId, searchIndexDataReaderRoleId)
  scope: searchService
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchIndexDataReaderRoleId)
  }
}

resource searchIndexDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(searchService.id, principalId, searchIndexDataContributorRoleId)
  scope: searchService
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchIndexDataContributorRoleId)
  }
}

resource searchServiceContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(searchService.id, principalId, searchServiceContributorRoleId)
  scope: searchService
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchServiceContributorRoleId)
  }
}

resource foundryUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryAccount.id, principalId, cognitiveServicesUserRoleId)
  scope: foundryAccount
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRoleId)
  }
}

resource foundryOpenAiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryAccount.id, principalId, cognitiveServicesOpenAiUserRoleId)
  scope: foundryAccount
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesOpenAiUserRoleId)
  }
}

resource foundryAiDeveloper 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryAccount.id, principalId, azureAiDeveloperRoleId)
  scope: foundryAccount
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', azureAiDeveloperRoleId)
  }
}

resource foundrySpeechUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryAccount.id, principalId, cognitiveServicesSpeechUserRoleId)
  scope: foundryAccount
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesSpeechUserRoleId)
  }
}
