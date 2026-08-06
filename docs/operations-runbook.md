# Operations runbook

## Health

- `/api/health`: process liveness
- `/api/ready`: persistence readiness
- Container Apps readiness invokes `/api/ready` internally.

## Deployment

1. Merge to `main`.
2. Confirm all reusable quality jobs pass.
3. The workflow builds `foundry-chat-app:<commit-sha>` in ACR.
4. Infrastructure receives that exact image tag.
5. The workflow waits for the latest revision to become ready and healthy, then verifies that it
   runs the expected commit-tagged image. The platform readiness probe validates `/api/ready`.
6. On smoke failure, the previous image is restored and the workflow fails.

The deployment uses a branch-based GitHub OIDC subject. If you add a GitHub Environment to the
deploy job, create a matching environment-based federated credential in Entra before changing the
workflow; GitHub changes the token subject when `environment:` is configured.

## Incident triage

```powershell
az containerapp show -g RG-AI-DEMO-APP1 -n ca-foundry-chat
az containerapp revision list -g RG-AI-DEMO-APP1 -n ca-foundry-chat -o table
az containerapp logs show -g RG-AI-DEMO-APP1 -n ca-foundry-chat --tail 200
```

Use `X-Request-ID` to correlate browser failures with application logs. Never paste tokens, cookies,
raw prompts, customer documents, or client secrets into issues.

## Manual rollback

```powershell
az containerapp update `
  --resource-group RG-AI-DEMO-APP1 `
  --name ca-foundry-chat `
  --image <acr-login-server>/foundry-chat-app:<known-good-commit>
```

## Dependency updates

Edit `requirements.txt` or `requirements-dev.txt`, then regenerate locks:

```powershell
uv pip compile requirements.txt --python-version 3.12 --universal --generate-hashes -o requirements.lock
uv pip compile requirements-dev.txt --python-version 3.12 --universal --generate-hashes -o requirements-dev.lock
```

Run all local quality gates before merging.
