# Hosted agent with Azure Developer CLI

This is the recommended tooling variant for the source-code hosted agent.
Azure Developer CLI (`azd`) packages the source, uploads it to Foundry, polls
the version until it is active, and configures the required deployment wiring.

This folder is intentionally separate from `hosted_agent_code`, which performs
the same source-code deployment lifecycle directly through the Python SDK.

## Prerequisites

- Azure CLI and Azure Developer CLI (`azd`)
- Python 3.13 or later
- A Microsoft Foundry project
- Permission to deploy hosted agents to that project

## Exact deployment steps

Run these commands from this folder in PowerShell.

1. Sign in:

```powershell
az login
azd auth login
```

2. Initialize this folder against an existing Foundry project. Replace the
resource ID with the value from Foundry **Manage > Project details**:

```powershell
azd ai agent init --no-prompt `
  --project-id "/subscriptions/<subscription-id>/resourceGroups/<resource-group>/providers/Microsoft.CognitiveServices/accounts/<account>/projects/<project>" `
  --deploy-mode code `
  --runtime python_3_13 `
  --entry-point main.py `
  --dep-resolution remote_build `
  --src src/azure-architect-hosted-azd
```

The checked-in `azure.yaml` already contains the resulting service
configuration. If `azd ai agent init` reports that the project is already
initialized, keep the existing `azure.yaml` and continue.

3. Select the existing azd environment. The environment `.env` file should
   already contain `AZURE_AI_MODEL_DEPLOYMENT_NAME`:

```powershell
azd env select hosted-agent-azd-dev
```

If the variable is missing, set it with:

```powershell
azd env set AZURE_AI_MODEL_DEPLOYMENT_NAME gpt-5-mini
```

4. Deploy the agent to the existing Foundry project:

```powershell
azd deploy
```

Use `azd up` only when you also want `azd` to provision resources described by
the project configuration. For an already existing Foundry project,
`azd deploy` is the narrower command.

5. Optionally run the agent locally through the azd host before deploying:

```powershell
azd env set FOUNDRY_PROJECT_ENDPOINT "https://<resource>.services.ai.azure.com/api/projects/<project>"
azd ai agent run
azd ai agent invoke --local "According to Microsoft Learn, what is a Hosted agent?"
```

`FOUNDRY_PROJECT_ENDPOINT` is declared explicitly in `azure.yaml` because AZD
does not inject it into the hosted process automatically. The model deployment
and Toolbox name are also passed through the service environment.

## Skill

The deployed agent is named `azure-architect-hosted-azd`.
`src/azure-architect-hosted-azd/main.py` loads
`skills/*/SKILL.md` at startup and appends each skill's instructions to the
agent's system prompt. This folder bundles a copy of the
azure-architecture-review Foundry Skill at
`src/azure-architect-hosted-azd/skills/azure-architecture-review/SKILL.md`,
which `azd` uploads automatically as part of the source directory. After
publishing a new skill version (see `..\skills\README.md`), refresh this copy
with `..\skills\download_skill.py` and run `azd deploy` (or `azd up`) again.
