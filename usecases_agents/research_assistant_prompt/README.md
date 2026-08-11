# Research Assistant (Prompt Agent)

This use case invokes the published Foundry Prompt Agent named `ResearchAgent`. The agent is configured in Microsoft Foundry with instructions and web-search tools rather than hosted from source code in this repository.

## Implementation map

| Layer | Location |
| --- | --- |
| Backend API and Foundry invocation | [`backend`](backend) |
| Frontend workspace | [`frontend/src/features/agentResearch`](../../frontend/src/features/agentResearch) |
| Marketplace metadata | [`frontend/src/features/useCases/agentResearch.ts`](../../frontend/src/features/useCases/agentResearch.ts) |
| Backend tests | [`tests/test_agent_research.py`](../../tests/test_agent_research.py) |

Set `FOUNDRY_PROJECT_ENDPOINT` to the project containing the published `ResearchAgent`.

## Foundry traces

Connect Application Insights to the Foundry project, then set
`FOUNDRY_APPLICATION_INSIGHTS_RESOURCE_ID` to its full Azure resource ID. The backend identity
needs `Log Analytics Reader` on that resource. After each response, the Activity panel polls
Application Insights by Foundry response ID and displays bounded span metadata. Trace ingestion
can take several seconds; prompt, output, tool arguments, and tool results are not returned.
