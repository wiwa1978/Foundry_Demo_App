param(
    [string]$SubscriptionId,
    [string]$Location = "swedencentral",
    [string]$ParameterFile = ".\infra\main.bicepparam",
    [string]$DeploymentName = "foundry-chat-rag-infra",
    [string]$FoundryProjectEndpoint,
    [string]$FoundryOpenAiEndpoint,
    [string]$FoundryModels,
    [string]$FoundryEmbeddingModel,
    [string]$FoundryRealtimeEndpoint,
    [string]$FoundryRealtimeModel,
    [string]$StorageContainerName,
    [string]$SearchIndexName,
    [string]$FoundryAccountName,
    [switch]$EnableEntraAuthentication,
    [string]$EntraAuthenticationClientId,
    [string]$EntraAuthenticationClientSecret,
    [string]$EntraAuthenticationTenantId,
    [switch]$AssignCurrentUserRoles
)

$ErrorActionPreference = "Stop"

function Invoke-AzCli {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $result = & az @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw ($result -join "`n")
    }
    return $result
}

function ConvertFrom-AzCliJson {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$CliOutput
    )

    $jsonText = ($CliOutput -join "`n").Trim()
    if (-not $jsonText) {
        return $null
    }
    return $jsonText | ConvertFrom-Json -Depth 100
}

function Get-DeploymentOutputValue {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Outputs,
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    if ($null -eq $Outputs) { return $null }
    if ($Outputs.PSObject.Properties.Name -contains $Name) {
        return $Outputs.$Name.value
    }
    return $null
}

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw "Azure CLI is required. Install it and run 'az login' before using this script."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$templateFile = Join-Path $PSScriptRoot "main.bicep"
$resolvedParameterFile = if ([System.IO.Path]::IsPathRooted($ParameterFile)) {
    $ParameterFile
} else {
    Join-Path $repoRoot $ParameterFile
}

if ($SubscriptionId) {
    Write-Host "Setting Azure subscription '$SubscriptionId'..."
    Invoke-AzCli @("account", "set", "--subscription", $SubscriptionId) | Out-Null
}

$deploymentArguments = @(
    "deployment", "sub", "create",
    "--name", $DeploymentName,
    "--location", $Location,
    "--template-file", $templateFile,
    "--parameters", $resolvedParameterFile
)

$parameterOverrides = @()
$parameterOverrides += "location=$Location"
if ($FoundryProjectEndpoint) { $parameterOverrides += "foundryProjectEndpoint=$FoundryProjectEndpoint" }
if ($FoundryOpenAiEndpoint) { $parameterOverrides += "foundryOpenAiEndpoint=$FoundryOpenAiEndpoint" }
if ($FoundryModels) { $parameterOverrides += "foundryModels=$FoundryModels" }
if ($FoundryEmbeddingModel) { $parameterOverrides += "foundryEmbeddingModel=$FoundryEmbeddingModel" }
if ($FoundryRealtimeEndpoint) { $parameterOverrides += "foundryRealtimeEndpoint=$FoundryRealtimeEndpoint" }
if ($FoundryRealtimeModel) { $parameterOverrides += "foundryRealtimeModel=$FoundryRealtimeModel" }
if ($StorageContainerName) { $parameterOverrides += "storageContainerName=$StorageContainerName" }
if ($SearchIndexName) { $parameterOverrides += "searchIndexName=$SearchIndexName" }
if ($FoundryAccountName) { $parameterOverrides += "foundryAccountName=$FoundryAccountName" }
if ($EnableEntraAuthentication) { $parameterOverrides += "enableEntraAuthentication=true" }
if ($EntraAuthenticationClientId) { $parameterOverrides += "entraAuthenticationClientId=$EntraAuthenticationClientId" }
if ($EntraAuthenticationClientSecret) { $parameterOverrides += "entraAuthenticationClientSecret=$EntraAuthenticationClientSecret" }
if ($EntraAuthenticationTenantId) { $parameterOverrides += "entraAuthenticationTenantId=$EntraAuthenticationTenantId" }

if ($parameterOverrides.Count -gt 0) {
    $deploymentArguments += @("--parameters")
    $deploymentArguments += $parameterOverrides
}

if ($AssignCurrentUserRoles) {
    Write-Host "Resolving signed-in user's object ID for RBAC assignments..."
    $principalId = (Invoke-AzCli @(
        "ad", "signed-in-user", "show",
        "--query", "id",
        "--output", "tsv"
    )).Trim()
    $deploymentArguments += @(
        "--parameters",
        "principalId=$principalId",
        "assignRagRoles=true",
        "principalType=User"
    )
}

Write-Host "Starting deployment '$DeploymentName'..."
$deploymentResult = ConvertFrom-AzCliJson (Invoke-AzCli ($deploymentArguments + @("--output", "json")))

$resolvedResourceGroupName = $null
if ($deploymentResult -and $deploymentResult.properties -and $deploymentResult.properties.parameters -and $deploymentResult.properties.parameters.resourceGroupName) {
    $resolvedResourceGroupName = $deploymentResult.properties.parameters.resourceGroupName.value
}
if (-not $resolvedResourceGroupName) {
    $resolvedResourceGroupName = (Invoke-AzCli @(
        "deployment", "sub", "show",
        "--name", $DeploymentName,
        "--query", "properties.parameters.resourceGroupName.value",
        "--output", "tsv"
    )).Trim()
}

$outputs = $deploymentResult.properties.outputs
$storageAccountUrl = Get-DeploymentOutputValue -Outputs $outputs -Name "storageAccountUrl"
$storageContainer = Get-DeploymentOutputValue -Outputs $outputs -Name "storageContainerName"
$searchEndpoint = Get-DeploymentOutputValue -Outputs $outputs -Name "searchEndpoint"
$searchIndex = Get-DeploymentOutputValue -Outputs $outputs -Name "searchIndexName"
$containerAppUrl = Get-DeploymentOutputValue -Outputs $outputs -Name "containerAppUrl"
$containerRegistryLoginServer = Get-DeploymentOutputValue -Outputs $outputs -Name "containerRegistryLoginServer"
$identityClientId = Get-DeploymentOutputValue -Outputs $outputs -Name "containerAppManagedIdentityClientId"
$identityPrincipalId = Get-DeploymentOutputValue -Outputs $outputs -Name "containerAppManagedIdentityPrincipalId"
$appEnvValues = Get-DeploymentOutputValue -Outputs $outputs -Name "appEnvValues"

Write-Host ""
Write-Host "Deployment succeeded." -ForegroundColor Green
Write-Host "Subscription : $((Invoke-AzCli @('account','show','--query','id','-o','tsv')).Trim())"
Write-Host "Resource group: $resolvedResourceGroupName"
Write-Host "Location     : $Location"

Write-Host ""
Write-Host "Endpoints and app config"
Write-Host "------------------------"
if ($containerAppUrl) { Write-Host "Container App URL           : $containerAppUrl" }
if ($storageAccountUrl) { Write-Host "Storage Blob Endpoint       : $storageAccountUrl" }
if ($storageContainer) { Write-Host "Storage Container           : $storageContainer" }
if ($searchEndpoint) { Write-Host "Search Endpoint             : $searchEndpoint" }
if ($searchIndex) { Write-Host "Search Index                : $searchIndex" }
if ($containerRegistryLoginServer) { Write-Host "ACR Login Server            : $containerRegistryLoginServer" }
if ($identityClientId) { Write-Host "Managed Identity Client Id  : $identityClientId" }
if ($identityPrincipalId) { Write-Host "Managed Identity PrincipalId: $identityPrincipalId" }

if ($appEnvValues) {
    Write-Host ""
    Write-Host "Suggested .env values"
    Write-Host "---------------------"
    Write-Host $appEnvValues
}

Write-Host ""
Write-Host "Resources in '$resolvedResourceGroupName'"
Write-Host "----------------------------------------"
Invoke-AzCli @(
    "resource", "list",
    "--resource-group", $resolvedResourceGroupName,
    "--query", "sort_by([].{Name:name,Type:type,Location:location}, &Type)",
    "--output", "table"
) | ForEach-Object { Write-Host $_ }

Write-Host ""
Write-Host "Private endpoints in '$resolvedResourceGroupName'"
Write-Host "-------------------------------------------------"
Invoke-AzCli @(
    "network", "private-endpoint", "list",
    "--resource-group", $resolvedResourceGroupName,
    "--query", "[].{Name:name,Subnet:subnet.id,Provisioning:provisioningState}",
    "--output", "table"
) | ForEach-Object { Write-Host $_ }
