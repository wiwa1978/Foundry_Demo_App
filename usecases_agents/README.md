# Agent use cases

Each agent use case has a dedicated folder. Hosted-agent use cases group deployable implementations by framework.
The existing `azure_architect_agent/hosted` path is retained as a compatibility
path for its current imports and deployments; new retail agent assets use the
`retail_agent/agent` layout below.

| Use case | Implementation |
| --- | --- |
| Azure Architect Agent (Prompt Agent) | [`azure_architect_agent/prompt`](azure_architect_agent/prompt/README.md) |
| Azure Architect Agent (Hosted Agent) | [`azure_architect_agent/hosted`](azure_architect_agent/hosted/README.md) |
| Azure Architect Agent (Provisioning assets) | [`azure_architect_agent/provisioning`](azure_architect_agent/provisioning/README.md) |
| Investment Planner (Prompt Agent, skills + agent identity) | [`investment_planner_prompt`](investment_planner_prompt/README.md) |
| Retail Shopping Assistant (SSE + bundled demo data) | [`retail_agent`](retail_agent/README.md) |
