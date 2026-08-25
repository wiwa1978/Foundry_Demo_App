# Azure Architect Agent (Prompt Agent)

This use case invokes the published Foundry Prompt Agent named `azure-architect-prompt`. The agent is configured in Microsoft Foundry with instructions and web-search tools rather than hosted from source code in this repository.

Provisioning scripts used to create/update this Prompt Agent are now stored in
[`../provisioning/prompt_agent`](../provisioning/prompt_agent).

## Implementation map

| Layer | Location |
| --- | --- |
| Backend API and Foundry invocation | [`backend`](backend) |
| Frontend workspace | [`frontend/src/features/azureArchitectAgent`](../../../frontend/src/features/azureArchitectAgent) |
| Marketplace metadata | [`frontend/src/features/useCases/azureArchitectAgent.ts`](../../../frontend/src/features/useCases/azureArchitectAgent.ts) |
| Backend tests | [`tests/test_azure_architect_agent.py`](../../../tests/test_azure_architect_agent.py) |

Set `FOUNDRY_PROJECT_ENDPOINT` to the project containing the published `azure-architect-prompt` agent.

## Foundry traces

Connect Application Insights to the Foundry project, then set
`FOUNDRY_APPLICATION_INSIGHTS_RESOURCE_ID` to its full Azure resource ID. The backend identity
needs `Log Analytics Reader` on that resource. After each response, the Activity panel polls
Application Insights by Foundry response ID and displays bounded span metadata. Trace ingestion
can take several seconds; prompt, output, tool arguments, and tool results are not returned.
