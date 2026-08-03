param(
    [Parameter(Mandatory = $true)]
    [string]$SubscriptionId,

    [Parameter(Mandatory = $true)]
    [string]$TenantId,

    [Parameter(Mandatory = $true)]
    [string]$GitHubOrgOrUser,

    [Parameter(Mandatory = $true)]
    [string]$GitHubRepo,

    [string]$AppName = "github-foundry-chat-demo-deploy",
    [string]$Branch = "main",

    [string]$FederatedSubject
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

Write-Host "Setting Azure subscription '$SubscriptionId'..."
Invoke-AzCli @("account", "set", "--subscription", $SubscriptionId) | Out-Null

$appId = & az ad app list --display-name $AppName --query "[0].appId" --output tsv 2>$null
if (-not $appId) {
    Write-Host "Creating Entra app registration '$AppName'..."
    $appId = (Invoke-AzCli @(
        "ad", "app", "create",
        "--display-name", $AppName,
        "--query", "appId",
        "--output", "tsv"
    )).Trim()
} else {
    $appId = $appId.Trim()
    Write-Host "Entra app registration '$AppName' already exists."
}

$spId = & az ad sp show --id $appId --query "id" --output tsv 2>$null
if (-not $spId) {
    Write-Host "Creating service principal for app registration..."
    $spId = (Invoke-AzCli @(
        "ad", "sp", "create",
        "--id", $appId,
        "--query", "id",
        "--output", "tsv"
    )).Trim()
} else {
    $spId = $spId.Trim()
}

$issuer = "https://token.actions.githubusercontent.com"
$subject = if ($FederatedSubject) {
    $FederatedSubject
} else {
    "repo:${GitHubOrgOrUser}/${GitHubRepo}:ref:refs/heads/${Branch}"
}
$credentialName = if ($FederatedSubject) {
    "github-${GitHubRepo}-${Branch}-actual-subject"
} else {
    "github-${GitHubRepo}-${Branch}"
}
$existingCredential = & az ad app federated-credential list `
    --id $appId `
    --query "[?subject=='$subject'].name | [0]" `
    --output tsv 2>$null

if (-not $existingCredential) {
    Write-Host "Creating federated credential for '$subject'..."
    $credentialJson = @{
        name = $credentialName
        issuer = $issuer
        subject = $subject
        audiences = @("api://AzureADTokenExchange")
    } | ConvertTo-Json -Depth 4 -Compress

    $credentialFile = New-TemporaryFile
    try {
        Set-Content -Path $credentialFile -Value $credentialJson -Encoding utf8
        Invoke-AzCli @(
            "ad", "app", "federated-credential", "create",
            "--id", $appId,
            "--parameters", $credentialFile.FullName
        ) | Out-Null
    } finally {
        Remove-Item $credentialFile -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "Federated credential '$credentialName' already exists."
}

$subscriptionScope = "/subscriptions/$SubscriptionId"
Write-Host "Assigning Contributor and User Access Administrator at subscription scope..."
foreach ($role in @("Contributor", "User Access Administrator")) {
    $assignment = & az role assignment list `
        --assignee $spId `
        --role $role `
        --scope $subscriptionScope `
        --query "[0].id" `
        --output tsv 2>$null
    if (-not $assignment) {
        Invoke-AzCli @(
            "role", "assignment", "create",
            "--assignee-object-id", $spId,
            "--assignee-principal-type", "ServicePrincipal",
            "--role", $role,
            "--scope", $subscriptionScope
        ) | Out-Null
    }
}

Write-Host ""
Write-Host "Create these GitHub repository variables:"
Write-Host "  AZURE_CLIENT_ID=$appId"
Write-Host "  AZURE_TENANT_ID=$TenantId"
Write-Host "  AZURE_SUBSCRIPTION_ID=$SubscriptionId"
Write-Host "  AZURE_LOCATION=swedencentral"
Write-Host "  RESOURCE_GROUP_NAME=RG-AI-CUSTOMERS-DEMO"
Write-Host "  CONTAINER_REGISTRY_NAME=acraicustomersdemo"
Write-Host "  CONTAINER_APP_NAME=ca-foundry-chat-demo"
