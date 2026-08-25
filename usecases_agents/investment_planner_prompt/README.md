# Investment Planner — prompt agent (skills + agent identity)

A **prompt agent** that builds a 6-month allocation plan from a portfolio CSV that lives in
Azure Blob Storage. It is the "configuration" half of a side-by-side demo; the hosted-agent
twin implements the exact same business outcome as deployed application code.

## Why this use case exists

| | Prompt agent (this folder) | Hosted agent (twin) |
| --- | --- | --- |
| What you author | model + instructions + tool list | Python app + `Dockerfile` + `azure.yaml` |
| Who runs the reasoning loop | Foundry | your container |
| Deployment | none — `create_version` publishes JSON | `azd up` builds and deploys an image |
| Iteration speed | seconds | a container build |
| Control over the loop | none (instructions only) | total |
| Invocation | Responses API, `agent_reference` | Responses API, `agent_reference` |

Everything to the right of "what you author" is identical from the caller's point of view — that
is the point of the demo. The two cards in the **Agents** tab answer the same question and
produce the same kind of plan.

Two Foundry capabilities carry this scenario:

- **Skills** — versioned folders of instructions plus optional scripts, published to the project
  and grouped into a *toolbox* that the agent reaches over MCP. `blob-reader` is a script skill;
  `allocation-policy` is instructions only.
- **Agent identity** — Foundry mints an Entra service principal for the agent when it is created.
  The `blob-reader` script calls `DefaultAzureCredential()` inside the managed harness and gets
  *the agent's* token, so the CSV is read under the agent's own identity. No key, no SAS, no
  connection string, and nothing to rotate.

## Implementation map

| Concern | File |
| --- | --- |
| Agent definition (model, instructions, tools) | `agent/provision_agent.py` |
| Skills + toolbox + connection publishing | `agent/provision_skills.py` |
| Blob read under agent identity | `agent/skills/blob-reader/` |
| Allocation rules and output format | `agent/skills/allocation-policy/SKILL.md` |
| Sample portfolio | `agent/data/holdings.csv` |
| Shared config / `az` helpers | `agent/agent_config.py` |
| Backend invocation + SSE relay | `backend/service.py` |
| HTTP route (`POST /api/investment-planner/stream`) | `backend/router.py` |
| Frontend workspace | `frontend/src/features/investmentPlanner/` |
| Marketplace card | `frontend/src/features/useCases/investmentPlannerPrompt.ts` |

## Environment

Add to the repo-root `.env`:

```dotenv
FOUNDRY_PROJECT_ENDPOINT=https://<resource>.services.ai.azure.com/api/projects/<project>
FOUNDRY_INVESTMENT_PLANNER_AGENT_NAME=investment-planner
FOUNDRY_INVESTMENT_PLANNER_MODEL=gpt-4.1
```

The provisioning script uses `FOUNDRY_INVESTMENT_PLANNER_MODEL` when set, then falls back to
`AZURE_AI_MODEL_DEPLOYMENT_NAME`, and finally the first entry in `FOUNDRY_MODELS`. It derives the
holdings URL as
`<AZURE_STORAGE_ACCOUNT_URL>/<AZURE_STORAGE_CONTAINER_NAME>/holdings.csv`; set
`HOLDINGS_BLOB_URL` only when the CSV uses a different path. `STORAGE_RESOURCE_ID` and
`PROJECT_RESOURCE_ID` are optional overrides. When omitted, the scripts resolve both IDs with
Azure CLI from the project endpoint, storage account URL, and the active subscription.

## Provisioning (run order matters)

```bash
cd usecases_agents/investment_planner_prompt/agent
az login

# 1. Upload the sample portfolio (any container the agent should be able to read).
az storage blob upload \
  --account-name <account> --container-name portfolios \
  --name holdings.csv --file data/holdings.csv --auth-mode login

# 2. Publish the skills, create the toolbox, and wire its project connection.
python provision_skills.py

# 3. Publish the prompt agent. This is what mints the agent identity.
python provision_agent.py create

# 4. Grant that identity Blob read + project access. --apply runs the az commands;
#    without it the commands are printed for review.
python provision_agent.py grant --apply
```

Wait 1–5 minutes after step 4 for RBAC to propagate, then open the **Agents** tab and pick
**Investment Planner (prompt agent)**.

`python provision_agent.py delete` removes every version of the agent.

## What you see in the UI

The activity panel surfaces each skill invocation as its own step (`Skill: blob-reader`,
`Skill: allocation-policy`), so the audience watches the agent reach Blob Storage before the
plan streams in. The answer is markdown produced by the code interpreter after it parses the CSV.

## Notes and gotchas

- **RBAC must come after `create`.** The agent identity does not exist until the agent version is
  published, so `grant` will fail if you run it first.
- **The managed harness (`harness: ghcp`) runs asynchronously.** It sometimes closes the SSE
  stream after `created`/`in_progress` and finishes in the background, so `backend/service.py`
  falls back to polling the response until it reaches a terminal status.
- **Skill scripts run in Foundry's sandbox, not in this repo.** `read_blob.py` is stdlib-only on
  purpose — it cannot rely on this project's dependencies.
- **The backend identity needs its own access.** Whoever runs the app (you locally, or the
  container app's managed identity) needs the *Azure AI User* role on the Foundry project to
  invoke the agent. That is separate from the agent identity's Blob role.
