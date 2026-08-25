# Prompt agent

This folder contains the Foundry **prompt agent** example. It creates a
server-side `PromptAgentDefinition` whose MCP tool calls the Microsoft Learn
MCP server directly through the `ms-learn-public` project connection.

## Run

From this folder:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item ..\.env .env
python create_agent.py
python chat.py
```

`create_agent.py` creates or versions the prompt agent. `chat.py` starts a
conversation with the configured agent and asks for MCP approval interactively.

## Microsoft Learn MCP prerequisite

Before the first run, create the public MCP connection this agent depends on
(one-time, from `..\skills`):

```powershell
cd ..\skills
azd ai project set "https://aifoundrydemo66fb.services.ai.azure.com/api/projects/proj66fb"
azd ai connection create ms-learn-public `
  --kind remote-tool `
  --target https://learn.microsoft.com/api/mcp `
  --auth-type none
python create_toolbox.py
azd ai toolbox publish azure-architect-toolbox <version-printed-by-script>
```

The `create_toolbox.py` and publish commands are only needed by hosted-agent
variants. For this Prompt Agent, `MCP_CONNECTION_NAME` must be
`ms-learn-public`.
The Prompt Agent uses the same `ms-learn-public` project connection directly.
This avoids nesting a Prompt Agent MCP proxy call through the Toolbox endpoint,
which currently causes the downstream connection to be dropped and Microsoft
Learn to return HTTP 401. Hosted agents continue using the shared Toolbox.
