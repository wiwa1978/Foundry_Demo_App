# Retail Shopping Assistant

The retail use case ports the repo2 Zava demo into a repo1-native structure:

```
retail_agent/
  agent/       # agent processor, MCP contract, handoff, and safe initializers
  backend/     # consolidated FastAPI SSE endpoint
  data/        # repo2 phase-one product catalog
  prompts/     # repo2 agent prompts
```

`POST /api/retail-agent/stream` accepts `message`, an optional `session_id`,
and the current `cart`. It emits typed SSE events (`start`, `step`,
`agent_selected`, `products`, `delta`, and `completed`). The completion event
returns the updated cart, so the browser owns cart state.

When `FOUNDRY_RETAIL_AGENT_NAME` is configured, the request follows the
repo2-style pre-A2A flow: the first turn starts with Cora, subsequent turns
call `zava-handoff-service-agent`, and the selected domain agent is invoked
with its logical tool assignment. This is intentionally application-side
routing; agent-to-agent orchestration is a future phase.

If a Foundry endpoint is configured but the retail entry agent name is
missing, the request returns a clear configuration error. Set
`FOUNDRY_RETAIL_OFFLINE_MODE=true` to explicitly use the bundled demo catalog.

The initializer scripts only read environment values when invoked. To
provision the complete retail set from the repository root, ensure
`FOUNDRY_PROJECT_ENDPOINT` and `FOUNDRY_MODELS` (or `FOUNDRY_RETAIL_MODEL`) are
set in `.env`, then run:


```powershell
python -m usecases_agents.retail_agent.agent.provision_retail_agents
```

This creates a new version of `zava-shop-assistant-agent`, `zava-inventory-agent`,
`zava-customer-loyalty-agent`, `zava-cart-manager-agent`,
`zava-interior-designer-agent`, and `zava-handoff-service-agent`. Afterward set
`FOUNDRY_RETAIL_AGENT_NAME=zava-shop-assistant-agent` and restart the backend.
