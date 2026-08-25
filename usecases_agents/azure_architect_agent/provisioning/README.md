# Azure Architect Agent provisioning

This folder physically merges the provisioning assets that create and deploy the
Azure Architect agents in Foundry.

## Included provisioning variants

- `prompt_agent/` — create/update the Prompt Agent (`azure-architect-prompt`)
- `hosted_agent_azd/` — Hosted Agent deployment with AZD
- `hosted_agent_code/` — Hosted Agent deployment from source-code zip (SDK)
- `hosted_agent_containers/` — Hosted Agent deployment from container image
- `hosted_agent_langchain/` — Hosted Agent deployment (LangChain)
- `hosted_agent_langgraph/` — Hosted Agent deployment (LangGraph)
- `hosted_agent_pydantic_ai/` — Hosted Agent deployment (Pydantic AI)
- `skills/` — shared skill-management scripts and bundled skill content

## Notes

- This merge intentionally excludes local-only artifacts (`.venv/`,
  `__pycache__/`, `.env`, generated `.zip` packages, and AZD local state).
- Use each subfolder's `README.md` and `.env.example` for exact prerequisites
  and commands.
