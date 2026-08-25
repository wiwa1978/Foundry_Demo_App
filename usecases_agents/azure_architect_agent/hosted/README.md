# Azure Architect Agent (Hosted Agent)

This use case runs custom agent code hosted by Foundry Agent Service. Each framework implementation has its own deployable subfolder.

Provisioning and deployment assets for all hosted variants are now stored in
[`../provisioning`](../provisioning/README.md).

## Implementations

| Framework | Location |
| --- | --- |
| Microsoft Agent Framework | [`microsoft_agent_framework`](microsoft_agent_framework/README.md) |

## App integration

| Layer | Location |
| --- | --- |
| Backend API and Foundry invocation | [`backend`](backend) |
| Frontend workspace | [`frontend/src/features/hostedAgent`](../../../frontend/src/features/hostedAgent) |
| Marketplace metadata | [`frontend/src/features/useCases/azureArchitectAgent.ts`](../../../frontend/src/features/useCases/azureArchitectAgent.ts) |
| Backend tests | [`tests/test_hosted_agent.py`](../../../tests/test_hosted_agent.py) |
