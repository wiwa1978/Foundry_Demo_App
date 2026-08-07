# Threat model

## Protected assets

- User prompts, conversations, uploaded documents, and generated content
- Foundry inference and deployment capacity
- Managed identity permissions
- Entra application credentials
- Azure Search, Storage, and Cosmos data

## Trust boundaries

1. Browser to Container Apps ingress and Easy Auth
2. Easy Auth headers to FastAPI identity parsing
3. FastAPI to Azure services through managed identity
4. User-provided files and prompts to parsers and model providers
5. GitHub Actions to Azure through workload identity federation

## Primary threats and controls

| Threat | Controls |
| --- | --- |
| Anonymous cost abuse | Entra authentication required, bounded inputs and model concurrency |
| Privilege escalation | Global settings and deployment creation restricted to `ADMIN_PRINCIPALS`; empty allowlist fails closed |
| Cross-user data access | Tenant/user-scoped repositories, Blob paths, and Search filters |
| Spoofed proxy identity | Proxy headers accepted only in explicit Container Apps auth mode |
| Prompt/document disclosure | Redacted bounded traces; no sensitive structured logs |
| Malicious uploads | Type/size limits and server-side extraction; parser sandboxing remains future work |
| WebSocket abuse | Authentication, origin validation, frame limits, and cleanup |
| Supply-chain compromise | Locked hashed Python dependencies, npm lockfile, dependency and image scans |
| Failed deployment | Immutable image tags, serialized deployment, smoke test, automatic image rollback |
| CI credential compromise | OIDC login and read-only repository token; Azure scopes must be minimized |

## Privileged operations

`PUT /api/model-settings`, `POST /api/models`, `GET /api/admin/deployments/config`, and
`POST /api/admin/deployments` change state shared by every user or provision billable Azure
capacity. They require a caller listed in `ADMIN_PRINCIPALS` (matched case-insensitively against
immutable Entra object ID or normalized email). Mutable, non-unique display names are never
authorized. Use object IDs in production; email matching is provided for local ergonomics.

- `APP_AUTH_MODE=local` or `container_apps`: non-listed callers receive `403`; an unset
  `ADMIN_PRINCIPALS` denies everyone.
- `APP_AUTH_MODE=disabled`: there is no identity provider, so these routes stay open for local
  development. The application logs an `authorization_open` warning at startup. Never use this
  mode outside a workstation.

## Accepted demo risks

- Search index management requires elevated Search permissions at runtime.
- This is a single-region demo without disaster-recovery replication.
- Model settings remain global rather than per-user; administrators change them for everyone.
