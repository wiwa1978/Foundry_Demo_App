# Research Assistant (Hosted Agent)

This use case runs custom agent code hosted by Foundry Agent Service. Each framework implementation has its own deployable subfolder.

## Implementations

| Framework | Location |
| --- | --- |
| Microsoft Agent Framework | [`microsoft_agent_framework`](microsoft_agent_framework/README.md) |

## App integration

| Layer | Location |
| --- | --- |
| Backend API and Foundry invocation | [`app/features/hosted_agent`](../../app/features/hosted_agent) |
| Frontend workspace | [`frontend/src/features/hostedAgent`](../../frontend/src/features/hostedAgent) |
| Marketplace metadata | [`frontend/src/features/useCases/hostedAgent.ts`](../../frontend/src/features/useCases/hostedAgent.ts) |
| Backend tests | [`tests/test_hosted_agent.py`](../../tests/test_hosted_agent.py) |
