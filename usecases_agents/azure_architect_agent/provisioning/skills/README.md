# Foundry Toolbox and Skills

This folder contains the optional **`azure-architecture-review`** skill source
and the scripts for creating the shared Foundry Toolbox. The active deployment
path uses the Toolbox for Microsoft Learn MCP; Foundry Skills remain disabled
because the preview upload API previously rejected valid `SKILL.md` front
matter.
See Microsoft Learn: [Use skills with Microsoft Foundry agents (preview)](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/skills).

A skill is *not* an MCP server. It is versioned instructions text
(`SKILL.md`) that gives an agent a repeatable workflow for a whole task
("review this architecture") on top of the raw facts an MCP server like
Microsoft Learn MCP provides ("what does this service do").

There are two different ways to deliver the same skill to an agent, and this
repo uses both, one per agent model:

| Variant | Delivery mode | How it gets the skill |
| --- | --- | --- |
| `prompt_agent` | **Direct MCP connection** | Its MCP tool calls Microsoft Learn through the `ms-learn-public` project connection. |
| `hosted_agent_code`, `hosted_agent_containers`, `hosted_agent_azd` | **Toolbox + local instructions** | Each folder uses the shared Toolbox and bundles its own local `skills/azure-architecture-review/SKILL.md`. |

Prompt agents have no application code to run at startup, so they use the
direct MCP connection. Hosted agents run real Python and can use both the
shared Toolbox and bundled local instructions.

## Files

- `azure-architecture-review/SKILL.md` — canonical skill content (the source
  of truth; hosted-agent copies are refreshed from this via `download_skill.py`
  after publishing).
- `manage_skill.py` — uploads `SKILL.md` as a new Foundry skill version and
  promotes it to the skill's default version.
- `create_toolbox.py` — creates a new `azure-architect-toolbox` version with
  the Microsoft Learn MCP tool.
- `download_skill.py` — downloads the current default skill version and
  refreshes the local `skills/azure-architecture-review/SKILL.md` copy in
  each hosted-agent folder.

## Setup

```powershell
cd "C:\Users\wimwauters\OneDrive - Microsoft\WIM_WORK\Code\Foundry Experiments\skills"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item ..\.env .env
```

## Create the public MCP connection

```powershell
azd ai project set "https://aifoundrydemo66fb.services.ai.azure.com/api/projects/proj66fb"
azd ai connection create ms-learn-public `
  --kind remote-tool `
  --target https://learn.microsoft.com/api/mcp `
  --auth-type none
```

## Create the Toolbox

```powershell
python create_toolbox.py
azd ai toolbox publish azure-architect-toolbox 2
```

This prints the toolbox consumer endpoint
(`.../toolboxes/azure-architect-toolbox/mcp?api-version=v1`). The script uses
the `MCP_CONNECTION_NAME` value from `.env` (`ms-learn-public`) so Foundry
connects to the public MCP server anonymously. Each script run creates an
immutable version; publish the returned version so the unversioned consumer
endpoint used by agents resolves to it.

Do not run `manage_skill.py` as part of the current setup.

## 3. Refresh the skill copy bundled with hosted agents

```powershell
python download_skill.py
```

This overwrites the local `skills/azure-architecture-review/SKILL.md` copy
in `hosted_agent_code`, `hosted_agent_containers`, and `hosted_agent_azd`
with the current default version. Redeploy those variants afterward
(`python deploy.py`, `azd deploy`, or a container rebuild + push) so the
running agent picks up the change — hosted agents load `SKILL.md` once, at
process startup.
