# Architecture

## Runtime

```mermaid
flowchart LR
  Browser[React SPA] -->|REST / SSE / WebSocket| API[FastAPI]
  API --> Services[Feature services]
  Services --> Gateways[Foundry and Azure gateways]
  Services --> Repositories[Repository contracts]
  Repositories --> SQLite[(SQLite local)]
  Repositories --> Cosmos[(Cosmos DB production)]
  Gateways --> Foundry[Microsoft Foundry]
  Gateways --> Search[Azure AI Search]
  Gateways --> Blob[Blob Storage]
  Gateways --> Speech[Azure Speech]
```

The frontend is a lazy-loaded application shell with feature-specific API modules and customer-facing
implementation guides under `frontend/src/features/`. FastAPI composes feature routers from
`app/features/`; reusable orchestration is in `app/services/`, provider boundaries in `app/gateways/`,
and storage behavior behind typed repository contracts.

## Data boundaries

- SQLite is used for local development.
- Production conversation data is stored in a versioned Cosmos container.
- Tenant and user IDs form the ownership boundary and Cosmos partition key.
- Original RAG documents use tenant/user-qualified Blob paths.
- Search chunks include filterable tenant and owner fields.
- Model settings are global by current product decision.

## Delivery

Pull requests run backend, frontend, infrastructure, secret, dependency, and image security gates.
Deployment builds a commit-tagged image, passes that immutable tag to Bicep, performs a smoke test,
and restores the previous image when smoke validation fails.

## Further reading

- [Threat model](threat-model.md)
- [Operations runbook](operations-runbook.md)
- [RBAC guidance](rbac.md)
- [Security policy](../SECURITY.md)
