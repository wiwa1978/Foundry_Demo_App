# Security policy

## Reporting

Do not open public issues for suspected vulnerabilities or leaked credentials. Report them privately
to the repository owner with reproduction steps, affected paths, and the potential impact.

## Supported version

This demo supports only the current `main` branch and active Azure Container App revision.

## Security controls

- Azure deployments require Microsoft Entra authentication.
- Conversations and documents are scoped by tenant and user.
- Secrets are supplied through GitHub Actions secrets or Azure-managed configuration.
- CI scans dependencies, source history, infrastructure, and the built container image.
- Provider payload traces are redacted and bounded.

Never commit `.env` files, tokens, client secrets, connection strings, downloaded customer documents,
or production log exports.
