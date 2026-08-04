param(
    [string]$SubscriptionId,
    [string]$ResourceGroupName = "RG-AI-DEMO-APP1",
    [string]$ContainerAppName = "ca-foundry-chat",
    [string]$AppDisplayName = "Foundry Chat App",
    [int]$SecretYears = 1,
    [string]$GitHubRepo
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

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw "Azure CLI is required. Install it and run 'az login' before using this script."
}

if ($SubscriptionId) {
    Write-Host "Setting Azure subscription '$SubscriptionId'..."
    Invoke-AzCli @("account", "set", "--subscription", $SubscriptionId) | Out-Null
}

$tenantId = (Invoke-AzCli @("account", "show", "--query", "tenantId", "--output", "tsv")).Trim()
$resourceGroupExists = (Invoke-AzCli @("group", "exists", "--name", $ResourceGroupName)).Trim().ToLowerInvariant() -eq "true"
if (-not $resourceGroupExists) {
    throw "Resource group '$ResourceGroupName' does not exist. Deploy the app infrastructure first, or pass -ResourceGroupName with the resource group that contains Container App '$ContainerAppName'."
}

try {
    $containerAppFqdn = (Invoke-AzCli @(
        "containerapp", "show",
        "--resource-group", $ResourceGroupName,
        "--name", $ContainerAppName,
        "--query", "properties.configuration.ingress.fqdn",
        "--output", "tsv"
    )).Trim()
} catch {
    throw "Container App '$ContainerAppName' was not found in resource group '$ResourceGroupName'. Deploy the app infrastructure first, or pass -ContainerAppName and -ResourceGroupName for the existing app. Original error:`n$($_.Exception.Message)"
}

if (-not $containerAppFqdn) {
    throw "Container App '$ContainerAppName' does not have an ingress FQDN."
}

$appUrl = "https://$containerAppFqdn"
$redirectUri = "$appUrl/.auth/login/aad/callback"

Write-Host "Using redirect URI: $redirectUri"

$existingApp = ConvertFrom-AzCliJson (Invoke-AzCli @(
    "ad", "app", "list",
    "--display-name", $AppDisplayName,
    "--query", "[0]",
    "--output", "json"
))

if ($existingApp) {
    $appId = $existingApp.appId
    Write-Host "Updating existing app registration '$AppDisplayName' ($appId)..."
    Invoke-AzCli @(
        "ad", "app", "update",
        "--id", $appId,
        "--sign-in-audience", "AzureADMyOrg",
        "--web-home-page-url", $appUrl,
        "--web-redirect-uris", $redirectUri,
        "--enable-id-token-issuance", "true"
    ) | Out-Null
} else {
    Write-Host "Creating app registration '$AppDisplayName'..."
    $createdApp = ConvertFrom-AzCliJson (Invoke-AzCli @(
        "ad", "app", "create",
        "--display-name", $AppDisplayName,
        "--sign-in-audience", "AzureADMyOrg",
        "--web-home-page-url", $appUrl,
        "--web-redirect-uris", $redirectUri,
        "--enable-id-token-issuance", "true",
        "--output", "json"
    ))
    $appId = $createdApp.appId
}

Write-Host "Creating a client secret for Container Apps authentication..."
$secret = ConvertFrom-AzCliJson (Invoke-AzCli @(
    "ad", "app", "credential", "reset",
    "--id", $appId,
    "--display-name", "container-app-auth",
    "--years", "$SecretYears",
    "--append",
    "--output", "json"
))

Write-Host ""
Write-Host "GitHub repository variables:"
Write-Host "ENABLE_ENTRA_AUTHENTICATION=true"
Write-Host "ENTRA_AUTH_CLIENT_ID=$appId"
Write-Host "ENTRA_AUTH_TENANT_ID=$tenantId"
Write-Host ""
Write-Host "GitHub repository secret:"
Write-Host "ENTRA_AUTH_CLIENT_SECRET=<secret value returned below>"
Write-Host ""
Write-Host "Client secret value. Copy it now; Entra will not show it again:"
Write-Host $secret.password

if ($GitHubRepo) {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw "GitHub CLI is required to set repo variables/secrets. Install gh or omit -GitHubRepo."
    }
    Write-Host ""
    Write-Host "Writing GitHub variables and secret to $GitHubRepo..."
    gh variable set ENABLE_ENTRA_AUTHENTICATION --repo $GitHubRepo --body "true"
    gh variable set ENTRA_AUTH_CLIENT_ID --repo $GitHubRepo --body $appId
    gh variable set ENTRA_AUTH_TENANT_ID --repo $GitHubRepo --body $tenantId
    $secret.password | gh secret set ENTRA_AUTH_CLIENT_SECRET --repo $GitHubRepo
}
