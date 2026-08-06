param(
    [string]$SubscriptionId,
    [string]$ResourceGroupName = "RG-AI-DEMO-APP1",
    [string]$SharedResourceGroupName = "RG-AI-DEMO",
    [string]$ContainerRegistryName = "acr66fb",
    [string]$ContainerAppName = "ca-foundry-chat",
    [string]$ImageName = "foundry-chat-app",
    [string]$ImageTag = (git rev-parse --short=12 HEAD)
)

$ErrorActionPreference = "Stop"

if (-not $ImageTag -or $ImageTag -eq "latest") {
    throw "Use an immutable image tag such as a Git commit SHA; 'latest' is not allowed."
}

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

if ($SubscriptionId) {
    Write-Host "Setting Azure subscription '$SubscriptionId'..."
    Invoke-AzCli @("account", "set", "--subscription", $SubscriptionId) | Out-Null
}

$loginServer = (Invoke-AzCli @(
    "acr", "show",
    "--resource-group", $SharedResourceGroupName,
    "--name", $ContainerRegistryName,
    "--query", "loginServer",
    "--output", "tsv"
)).Trim()

$image = "${ImageName}:${ImageTag}"
$fullImage = "${loginServer}/${image}"

Write-Host "Building and pushing '$fullImage' with Azure Container Registry..."
Invoke-AzCli @(
    "acr", "build",
    "--registry", $ContainerRegistryName,
    "--image", $image,
    $repoRoot
) | Out-Null

Write-Host "Updating Container App '$ContainerAppName' to image '$fullImage'..."
Invoke-AzCli @(
    "containerapp", "update",
    "--resource-group", $ResourceGroupName,
    "--name", $ContainerAppName,
    "--image", $fullImage,
    "--output", "none"
) | Out-Null

$appUrl = (Invoke-AzCli @(
    "containerapp", "show",
    "--resource-group", $ResourceGroupName,
    "--name", $ContainerAppName,
    "--query", "properties.configuration.ingress.fqdn",
    "--output", "tsv"
)).Trim()

Write-Host "Container App image updated:"
Write-Host "  Image: $fullImage"
Write-Host "  URL: https://$appUrl"
