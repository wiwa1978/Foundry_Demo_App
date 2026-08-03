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

Invoke-AzCli $deploymentArguments
