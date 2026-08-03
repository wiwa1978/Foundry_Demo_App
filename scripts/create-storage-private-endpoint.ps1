param(
    [string]$SubscriptionId,

    [Parameter(Mandatory = $true)]
    [string]$ResourceGroup,

    [Parameter(Mandatory = $true)]
    [string]$StorageAccountName,

    [Parameter(Mandatory = $true)]
    [string]$VirtualNetworkResourceGroup,

    [Parameter(Mandatory = $true)]
    [string]$VirtualNetworkName,

    [Parameter(Mandatory = $true)]
    [string]$SubnetName,

    [string]$PrivateEndpointName = "$StorageAccountName-blob-pe",
    [string]$PrivateConnectionName = "$StorageAccountName-blob-connection",
    [string]$PrivateDnsZoneResourceGroup = $ResourceGroup,
    [string]$PrivateDnsZoneName = "privatelink.blob.core.windows.net",
    [string]$PrivateDnsVnetLinkName = "$VirtualNetworkName-blob-dns-link",
    [string]$Location,
    [string]$VirtualNetworkAddressPrefix = "10.40.0.0/16",
    [string]$SubnetAddressPrefix = "10.40.1.0/24",
    [string]$StorageSkuName = "Standard_LRS",
    [string]$StorageKind = "StorageV2",
    [string]$SearchServiceName,
    [string]$SearchSkuName = "basic",
    [string]$SearchIndexName = "foundry-document-rag",
    [switch]$CreateResourceGroupsIfMissing,
    [switch]$CreateNetworkIfMissing,
    [switch]$CreateStorageAccountIfMissing,
    [switch]$CreateSearchServiceIfMissing,
    [switch]$DisableStoragePublicNetworkAccess
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

if ($SubscriptionId) {
    Write-Host "Setting Azure subscription '$SubscriptionId'..."
    Invoke-AzCli @("account", "set", "--subscription", $SubscriptionId) | Out-Null
}

if (-not $Location) {
    $existingStorageResourceGroupLocation = & az group show `
        --name $ResourceGroup `
        --query "location" `
        --output tsv 2>$null

    if ($LASTEXITCODE -eq 0 -and $existingStorageResourceGroupLocation) {
        $Location = $existingStorageResourceGroupLocation.Trim()
    }
}

if (-not $Location) {
    throw "Location is required when the resource group does not already exist. Rerun with -Location, for example -Location `"westeurope`"."
}

$storageResourceGroupId = & az group show `
    --name $ResourceGroup `
    --query "id" `
    --output tsv 2>$null

if ($LASTEXITCODE -eq 0 -and $storageResourceGroupId) {
    Write-Host "Resource group '$ResourceGroup' already exists."
} elseif ($CreateResourceGroupsIfMissing) {
    Write-Host "Creating resource group '$ResourceGroup'..."
    Invoke-AzCli @(
        "group", "create",
        "--name", $ResourceGroup,
        "--location", $Location,
        "--output", "none"
    ) | Out-Null
} else {
    throw "Resource group '$ResourceGroup' was not found. Rerun with -CreateResourceGroupsIfMissing to create it, or pass an existing resource group."
}

if ($VirtualNetworkResourceGroup -ne $ResourceGroup) {
    $networkResourceGroupId = & az group show `
        --name $VirtualNetworkResourceGroup `
        --query "id" `
        --output tsv 2>$null

    if ($LASTEXITCODE -eq 0 -and $networkResourceGroupId) {
        Write-Host "Resource group '$VirtualNetworkResourceGroup' already exists."
    } elseif ($CreateResourceGroupsIfMissing) {
        Write-Host "Creating resource group '$VirtualNetworkResourceGroup'..."
        Invoke-AzCli @(
            "group", "create",
            "--name", $VirtualNetworkResourceGroup,
            "--location", $Location,
            "--output", "none"
        ) | Out-Null
    } else {
        throw "Resource group '$VirtualNetworkResourceGroup' was not found. Rerun with -CreateResourceGroupsIfMissing to create it, or pass an existing resource group."
    }
}

$vnetId = & az network vnet show `
    --resource-group $VirtualNetworkResourceGroup `
    --name $VirtualNetworkName `
    --query "id" `
    --output tsv 2>$null

if ($LASTEXITCODE -eq 0 -and $vnetId) {
    $vnetId = $vnetId.Trim()
    Write-Host "Virtual network '$VirtualNetworkName' already exists."
} elseif ($CreateNetworkIfMissing) {
    Write-Host "Creating virtual network '$VirtualNetworkName' with subnet '$SubnetName'..."
    $vnetId = (Invoke-AzCli @(
        "network", "vnet", "create",
        "--resource-group", $VirtualNetworkResourceGroup,
        "--name", $VirtualNetworkName,
        "--location", $Location,
        "--address-prefixes", $VirtualNetworkAddressPrefix,
        "--subnet-name", $SubnetName,
        "--subnet-prefixes", $SubnetAddressPrefix,
        "--query", "newVNet.id",
        "--output", "tsv"
    )).Trim()
} else {
    throw "Virtual network '$VirtualNetworkName' was not found in resource group '$VirtualNetworkResourceGroup'. Rerun with -CreateNetworkIfMissing to create it, or pass an existing VNet."
}

$subnetId = & az network vnet subnet show `
    --resource-group $VirtualNetworkResourceGroup `
    --vnet-name $VirtualNetworkName `
    --name $SubnetName `
    --query "id" `
    --output tsv 2>$null

if ($LASTEXITCODE -eq 0 -and $subnetId) {
    $subnetId = $subnetId.Trim()
    Write-Host "Subnet '$SubnetName' already exists."
} elseif ($CreateNetworkIfMissing) {
    Write-Host "Creating subnet '$SubnetName'..."
    $subnetId = (Invoke-AzCli @(
        "network", "vnet", "subnet", "create",
        "--resource-group", $VirtualNetworkResourceGroup,
        "--vnet-name", $VirtualNetworkName,
        "--name", $SubnetName,
        "--address-prefixes", $SubnetAddressPrefix,
        "--query", "id",
        "--output", "tsv"
    )).Trim()
} else {
    throw "Subnet '$SubnetName' was not found in VNet '$VirtualNetworkName'. Rerun with -CreateNetworkIfMissing to create it, or pass an existing subnet."
}

$storageAccountId = & az storage account show `
    --resource-group $ResourceGroup `
    --name $StorageAccountName `
    --query "id" `
    --output tsv 2>$null

if ($LASTEXITCODE -eq 0 -and $storageAccountId) {
    $storageAccountId = $storageAccountId.Trim()
    Write-Host "Storage account '$StorageAccountName' already exists."
} elseif ($CreateStorageAccountIfMissing) {
    Write-Host "Creating storage account '$StorageAccountName' in resource group '$ResourceGroup'..."
    $publicNetworkAccess = if ($DisableStoragePublicNetworkAccess) { "Disabled" } else { "Enabled" }
    $storageAccountId = (Invoke-AzCli @(
        "storage", "account", "create",
        "--resource-group", $ResourceGroup,
        "--name", $StorageAccountName,
        "--location", $Location,
        "--sku", $StorageSkuName,
        "--kind", $StorageKind,
        "--https-only", "true",
        "--min-tls-version", "TLS1_2",
        "--allow-blob-public-access", "false",
        "--public-network-access", $publicNetworkAccess,
        "--query", "id",
        "--output", "tsv"
    )).Trim()
} else {
    throw "Storage account '$StorageAccountName' was not found in resource group '$ResourceGroup'. Rerun with -CreateStorageAccountIfMissing to create it, or pass an existing storage account name and resource group."
}

if ($SearchServiceName) {
    $searchServiceId = & az search service show `
        --resource-group $ResourceGroup `
        --name $SearchServiceName `
        --query "id" `
        --output tsv 2>$null

    if ($LASTEXITCODE -eq 0 -and $searchServiceId) {
        Write-Host "Azure AI Search service '$SearchServiceName' already exists."
    } elseif ($CreateSearchServiceIfMissing) {
        Write-Host "Creating Azure AI Search service '$SearchServiceName'..."
        Invoke-AzCli @(
            "search", "service", "create",
            "--resource-group", $ResourceGroup,
            "--name", $SearchServiceName,
            "--location", $Location,
            "--sku", $SearchSkuName,
            "--output", "none"
        ) | Out-Null
    } else {
        throw "Azure AI Search service '$SearchServiceName' was not found in resource group '$ResourceGroup'. Rerun with -CreateSearchServiceIfMissing to create it, or omit -SearchServiceName if you only want storage private endpoint setup."
    }
}

Write-Host "Disabling private endpoint network policies on subnet '$SubnetName'..."
Invoke-AzCli @(
    "network", "vnet", "subnet", "update",
    "--resource-group", $VirtualNetworkResourceGroup,
    "--vnet-name", $VirtualNetworkName,
    "--name", $SubnetName,
    "--disable-private-endpoint-network-policies", "true",
    "--output", "none"
) | Out-Null

$existingEndpoint = & az network private-endpoint show `
    --resource-group $ResourceGroup `
    --name $PrivateEndpointName `
    --query "id" `
    --output tsv 2>$null

if ($LASTEXITCODE -eq 0 -and $existingEndpoint) {
    Write-Host "Private endpoint '$PrivateEndpointName' already exists."
} else {
    Write-Host "Creating private endpoint '$PrivateEndpointName' for Blob Storage..."
    Invoke-AzCli @(
        "network", "private-endpoint", "create",
        "--resource-group", $ResourceGroup,
        "--name", $PrivateEndpointName,
        "--location", $Location,
        "--subnet", $subnetId,
        "--private-connection-resource-id", $storageAccountId,
        "--group-id", "blob",
        "--connection-name", $PrivateConnectionName,
        "--output", "none"
    ) | Out-Null
}

$dnsZoneId = & az network private-dns zone show `
    --resource-group $PrivateDnsZoneResourceGroup `
    --name $PrivateDnsZoneName `
    --query "id" `
    --output tsv 2>$null

if ($LASTEXITCODE -eq 0 -and $dnsZoneId) {
    Write-Host "Private DNS zone '$PrivateDnsZoneName' already exists."
} else {
    Write-Host "Creating private DNS zone '$PrivateDnsZoneName'..."
    $dnsZoneId = (Invoke-AzCli @(
        "network", "private-dns", "zone", "create",
        "--resource-group", $PrivateDnsZoneResourceGroup,
        "--name", $PrivateDnsZoneName,
        "--query", "id",
        "--output", "tsv"
    )).Trim()
}

$vnetId = (Invoke-AzCli @(
    "network", "vnet", "show",
    "--resource-group", $VirtualNetworkResourceGroup,
    "--name", $VirtualNetworkName,
    "--query", "id",
    "--output", "tsv"
)).Trim()

$existingDnsLink = & az network private-dns link vnet show `
    --resource-group $PrivateDnsZoneResourceGroup `
    --zone-name $PrivateDnsZoneName `
    --name $PrivateDnsVnetLinkName `
    --query "id" `
    --output tsv 2>$null

if ($LASTEXITCODE -eq 0 -and $existingDnsLink) {
    Write-Host "Private DNS VNet link '$PrivateDnsVnetLinkName' already exists."
} else {
    Write-Host "Linking private DNS zone to VNet '$VirtualNetworkName'..."
    Invoke-AzCli @(
        "network", "private-dns", "link", "vnet", "create",
        "--resource-group", $PrivateDnsZoneResourceGroup,
        "--zone-name", $PrivateDnsZoneName,
        "--name", $PrivateDnsVnetLinkName,
        "--virtual-network", $vnetId,
        "--registration-enabled", "false",
        "--output", "none"
    ) | Out-Null
}

$existingZoneGroup = & az network private-endpoint dns-zone-group show `
    --resource-group $ResourceGroup `
    --endpoint-name $PrivateEndpointName `
    --name "default" `
    --query "id" `
    --output tsv 2>$null

if ($LASTEXITCODE -eq 0 -and $existingZoneGroup) {
    Write-Host "Private endpoint DNS zone group already exists."
} else {
    Write-Host "Attaching private DNS zone to private endpoint..."
    Invoke-AzCli @(
        "network", "private-endpoint", "dns-zone-group", "create",
        "--resource-group", $ResourceGroup,
        "--endpoint-name", $PrivateEndpointName,
        "--name", "default",
        "--private-dns-zone", $dnsZoneId,
        "--zone-name", "blob",
        "--output", "none"
    ) | Out-Null
}

if ($DisableStoragePublicNetworkAccess) {
    Write-Host "Disabling public network access on storage account '$StorageAccountName'..."
    Invoke-AzCli @(
        "storage", "account", "update",
        "--resource-group", $ResourceGroup,
        "--name", $StorageAccountName,
        "--public-network-access", "Disabled",
        "--output", "none"
    ) | Out-Null
}

$privateEndpointId = (Invoke-AzCli @(
    "network", "private-endpoint", "show",
    "--resource-group", $ResourceGroup,
    "--name", $PrivateEndpointName,
    "--query", "id",
    "--output", "tsv"
)).Trim()

Write-Host ""
Write-Host "Storage Blob private endpoint is ready:"
Write-Host "  Private endpoint: $privateEndpointId"
Write-Host "  Private DNS zone: $dnsZoneId"
Write-Host "  Storage URL for the app: https://$StorageAccountName.blob.core.windows.net"
if ($SearchServiceName) {
    Write-Host "  Azure AI Search endpoint for the app: https://$SearchServiceName.search.windows.net"
    Write-Host "  Azure AI Search index name for the app: $SearchIndexName"
}
Write-Host ""
Write-Host "App .env values:"
Write-Host "  AZURE_STORAGE_ACCOUNT_URL=https://$StorageAccountName.blob.core.windows.net"
Write-Host "  AZURE_STORAGE_CONTAINER_NAME=foundry-rag-documents"
if ($SearchServiceName) {
    Write-Host "  AZURE_SEARCH_ENDPOINT=https://$SearchServiceName.search.windows.net"
    Write-Host "  AZURE_SEARCH_INDEX_NAME=$SearchIndexName"
}
Write-Host ""
Write-Host "Run the app from a host connected to '$VirtualNetworkName' so DNS resolves the storage account to the private endpoint."
