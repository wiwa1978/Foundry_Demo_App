# Hosted agent with LangChain

This independent example deploys the same Azure architecture assistant as the
other framework variants. The agent logic is implemented with LangChain and
uses the shared Foundry toolbox for Microsoft Learn MCP grounding.
Foundry supplies the managed runtime and Responses protocol.

## Run locally

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r agent\requirements.txt
Copy-Item .env.example .env
az login
python agent\main.py
```

Set `FOUNDRY_PROJECT_ENDPOINT`, `AZURE_AI_MODEL_DEPLOYMENT_NAME`, and
`TOOLBOX_NAME` (for example, `azure-architect-toolbox`) before starting the
local server.
Use `azd ai agent invoke --local` or the Foundry Agent Inspector to send a
request.

## Deploy

Set `PROJECT_ENDPOINT`, `MODEL_NAME`, and optionally `AGENT_NAME` in `.env`,
then run:

```powershell
pip install azure-ai-projects python-dotenv
python deploy.py
```
