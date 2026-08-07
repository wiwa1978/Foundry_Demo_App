targetScope = 'resourceGroup'

@description('Existing shared Cosmos DB account name.')
param accountName string

@description('Existing shared Cosmos DB for NoSQL database name.')
param databaseName string

@description('App-specific Cosmos DB container name.')
param containerName string

@description('Managed identity principal ID that receives access to this app container.')
param principalId string

resource account 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' existing = {
  name: accountName
}

resource container 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  name: '${accountName}/${databaseName}/${containerName}-v3'
  properties: {
    resource: {
      id: '${containerName}-v3'
      partitionKey: {
        paths: [
          '/partition_key'
        ]
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          {
            path: '/*'
          }
        ]
        excludedPaths: [
          {
            path: '/"_etag"/?'
          }
        ]
        compositeIndexes: [
          [
            {
              path: '/updated_at'
              order: 'descending'
            }
            {
              path: '/id'
              order: 'ascending'
            }
          ]
          [
            {
              path: '/created_at'
              order: 'ascending'
            }
            {
              path: '/id'
              order: 'ascending'
            }
          ]
        ]
      }
    }
  }
}

resource dataContributor 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: account
  name: guid(account.id, container.id, principalId)
  properties: {
    principalId: principalId
    roleDefinitionId: '${account.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
    scope: '${account.id}/dbs/${databaseName}/colls/${containerName}-v3'
  }
}

output endpoint string = account.properties.documentEndpoint
