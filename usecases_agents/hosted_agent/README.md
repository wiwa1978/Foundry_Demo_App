# Hosted Agent

This is the canonical application-facing package for Foundry-hosted agents.
The deployable Microsoft Agent Framework project and its runtime adapter are
currently retained under `azure_architect_agent/hosted` to avoid breaking
existing deployments and imports.

The hosted runtime follows the same outer contract as `retail_agent`:

- typed request and stream events
- a FastAPI router
- an async streaming service
- SSE transport

Its internal execution remains Foundry-hosted, while `retail_agent` uses the
repo2-style application-side MCP function-call loop.
