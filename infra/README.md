# Foundry Chat App infrastructure

This folder provisions the Azure resources needed by the **Document Q&A** use case from scratch:

- Resource group
- Virtual network and private endpoint subnet
- Storage account and Blob container for original uploads
- Storage Blob private endpoint and `privatelink.blob.core.windows.net` private DNS
- Azure AI Search service for document chunks and vectors
- Azure Container Registry
- Azure Container Apps environment integrated with the VNet
- One external Container App that serves both the React frontend and FastAPI backend
- Optional Azure AI Search private endpoint
- Optional RBAC assignments for the signed-in user or another principal

## Deploy

Review `main.bicepparam`, then deploy the infrastructure:

```powershell
.\infra\deploy.ps1 `
  -SubscriptionId "12aa5cea-1cef-4ce4-85f1-d890b5350326" `
  -AssignCurrentUserRoles
```

The first deployment uses a public placeholder image so Azure Container Registry and Container Apps can be created before the app image exists. After the deployment finishes, build and publish the real image:

```powershell
.\infra\build-and-deploy-image.ps1 `
  -SubscriptionId "12aa5cea-1cef-4ce4-85f1-d890b5350326"
```

Or deploy directly with Azure CLI:

```powershell
az deployment sub create `
  --subscription "12aa5cea-1cef-4ce4-85f1-d890b5350326" `
  --location germanywestcentral `
  --template-file .\infra\main.bicep `
  --parameters .\infra\main.bicepparam
```

The deployment outputs the `.env` values used by the app:

```env
AZURE_STORAGE_ACCOUNT_URL=https://storaicustomersdemo.blob.core.windows.net
AZURE_STORAGE_CONTAINER_NAME=foundry-documents
AZURE_SEARCH_ENDPOINT=https://srch-ai-customers-demo.search.windows.net
AZURE_SEARCH_INDEX_NAME=foundry-document-rag
FOUNDRY_EMBEDDING_MODEL=text-embedding-3-small
```

The app creates the Azure AI Search index on first document upload.

The Container App uses a user-assigned managed identity and receives data-plane RBAC for Blob Storage and Azure AI Search. Assign that same identity access to your Foundry project, such as the **Azure AI User** / Foundry user role required by your environment, so `DefaultAzureCredential` can call Foundry from Container Apps.

## GitHub Actions deployment

The workflow in `.github\workflows\deploy-container-app.yml` deploys infrastructure, builds the Docker image with Azure Container Registry, and updates the Container App image on pushes to `main`.

Create the GitHub Actions OIDC app registration and Azure role assignments with:

```powershell
.\infra\github-actions-setup.ps1 `
  -SubscriptionId "12aa5cea-1cef-4ce4-85f1-d890b5350326" `
  -TenantId "<tenant-id>" `
  -GitHubOrgOrUser "wiwa1978" `
  -GitHubRepo "Foundry_Demo_App"
```

Then create these GitHub repository variables from the script output:

```text
AZURE_CLIENT_ID
AZURE_TENANT_ID
AZURE_SUBSCRIPTION_ID
AZURE_LOCATION
RESOURCE_GROUP_NAME
CONTAINER_REGISTRY_NAME
CONTAINER_APP_NAME
```

Also create these repository variables from your local `.env` values:

```text
FOUNDRY_PROJECT_ENDPOINT
FOUNDRY_OPENAI_ENDPOINT
FOUNDRY_MODELS
FOUNDRY_REALTIME_ENDPOINT
FOUNDRY_REALTIME_MODEL
FOUNDRY_EMBEDDING_MODEL
AZURE_STORAGE_CONTAINER_NAME
AZURE_SEARCH_INDEX_NAME
```

Do not add `AZURE_STORAGE_ACCOUNT_URL` or `AZURE_SEARCH_ENDPOINT` as GitHub variables; the Bicep deployment derives those from the Azure resources it creates. Do not add `FOUNDRY_API_KEY` unless you intentionally change the app to API-key auth. The app currently uses Microsoft Entra ID through `DefaultAzureCredential`.

The workflow identity needs **Contributor** to create/update resources and **User Access Administrator** to create RBAC assignments for the Container App managed identity. If your organization prefers least-privilege custom roles, replace those broad assignments after the initial demo setup.

## Private networking note

Storage public network access is disabled by default. The Container App runs in the same VNet as the Storage private endpoint, so backend uploads work without opening the storage account. If colleagues need local backend access without VPN/private connectivity, set `storagePublicNetworkAccess = 'Enabled'` in `main.bicepparam` for their demo environment.

Azure AI Search public network access is enabled by default for local demos. To also make Search private-only, set:

```bicep
param searchPublicNetworkAccess = 'disabled'
param enableSearchPrivateEndpoint = true
```
