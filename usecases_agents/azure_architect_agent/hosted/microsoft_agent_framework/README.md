# Research Assistant (Hosted Agent) - Microsoft Agent Framework

This is the code-first Research Assistant implementation built with Microsoft Agent Framework. Foundry Agent Service builds and hosts the code and exposes it through the Responses protocol.

Other framework implementations of this hosted-agent use case belong in sibling folders under `usecases_agents/azure_architect_agent/hosted`.

## Configure

Use an existing Foundry project with a deployed chat model. From this directory, initialize an azd environment and set these values:

```powershell
$env:AZURE_DEV_USER_AGENT = "microsoft_foundry_skill"
azd env new hosted-assistant
azd env set AZURE_AI_PROJECT_ID "<project-resource-id>"
azd env set AZURE_AI_PROJECT_ENDPOINT "<project-endpoint>"
azd env set AZURE_AI_MODEL_DEPLOYMENT_NAME "<deployment-name>"
```

Create `src/.env` from `src/.env.example` for direct local execution.

## Test And Deploy

```powershell
$env:AZURE_DEV_USER_AGENT = "microsoft_foundry_skill"
azd ai agent run --no-client
azd deploy
azd ai agent invoke "Explain why code-hosted agents are useful."
```

After deployment, the chat app defaults to the agent name `hosted-assistant`. Set this only if you deployed it under a different name:

```text
FOUNDRY_HOSTED_AGENT_NAME=hosted-assistant
```

The chat app calls the routed hosted endpoint through `AIProjectClient.get_openai_client(agent_name=...)`.
