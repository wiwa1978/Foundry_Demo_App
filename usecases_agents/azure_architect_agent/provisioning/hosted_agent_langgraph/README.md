# Hosted agent with LangGraph

This independent example implements the same Azure architecture assistant as
the other framework variants, using a LangGraph state graph and the shared
Foundry toolbox for Microsoft Learn MCP grounding. Foundry manages the hosted runtime and conversation
history; LangGraph owns the application workflow.

## Run locally

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r agent\requirements.txt
az login
python agent\main.py
```

Set `FOUNDRY_PROJECT_ENDPOINT`, `AZURE_AI_MODEL_DEPLOYMENT_NAME`, and
`TOOLBOX_NAME` in the environment. Invoke
the local server with `azd ai agent invoke --local`.

## Deploy

Set `PROJECT_ENDPOINT`, `MODEL_NAME`, and optionally `AGENT_NAME` in `.env`,
install `azure-ai-projects` and `python-dotenv`, then run `python deploy.py`.
