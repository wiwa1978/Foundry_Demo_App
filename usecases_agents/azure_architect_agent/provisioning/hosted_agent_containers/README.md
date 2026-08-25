# Hosted agent with containers

This folder deploys the Responses protocol agent as a Docker image stored in
Azure Container Registry (ACR). Foundry pulls the image when a new hosted-agent
version is created.

## Prerequisites

- Azure CLI, Docker Desktop, and Python 3.10 or later
- An Azure subscription, resource group, and Azure AI Foundry project
- An Azure Container Registry where you can push images
- `az login` completed with permission to push to ACR and manage hosted agents

## Exact deployment steps

Run these commands from this folder in PowerShell.

1. Sign in and select the subscription:

```powershell
az login
az account set --subscription "<subscription-id-or-name>"
```

2. Create an ACR if you do not already have one:

```powershell
az acr create `
  --resource-group "<resource-group>" `
  --name "<globally-unique-acr-name>" `
  --sku Basic
```

3. Authenticate Docker to ACR and build/push the image:

```powershell
$acrName = "<globally-unique-acr-name>"
$image = "$acrName.azurecr.io/azure-architect-hosted-container:latest"
az acr login --name $acrName
docker build --tag $image .
docker push $image
```

4. Create the local deployment environment:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `.env` and set `PROJECT_ENDPOINT`, `MODEL_NAME`, `AGENT_NAME`, and
`CONTAINER_IMAGE` to the values for your project and pushed image. Prefer a
unique image tag instead of `:latest`, for example
`acr66fb.azurecr.io/azure-architect-hosted-container:v2`.

5. Register the image as a Foundry hosted-agent version:

```powershell
python deploy.py
```

The deployment script creates a new version using
`container_configuration`, waits for it to become active, and sends a smoke
test. It does not build or push the image; those operations are intentionally
explicit in step 3.

## Skill

`main.py` loads `skills/*/SKILL.md` at startup and appends each skill's
instructions to the agent's system prompt. This folder bundles a copy of the
azure-architecture-review Foundry Skill at
`skills/azure-architecture-review/SKILL.md`. After publishing a new skill
version (see `..\skills\README.md`), refresh this copy with
`..\skills\download_skill.py` and rebuild/push the image (step 3) before
redeploying (step 5) so the running container picks up the change.
