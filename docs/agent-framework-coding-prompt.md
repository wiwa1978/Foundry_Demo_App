# Microsoft Agent Framework coding prompt

Build the first agent use case in this demo app using **Microsoft Agent Framework**.

## Goal

Replace any ad hoc agent orchestration with Microsoft Agent Framework as the agent layer.
Keep the first demo intentionally simple and visible: a **Research Assistant** agent that answers
a user question, uses a grounding/search tool, and streams both tool steps and the final response
in the UI.

## What to build

### Backend

- Inspect the existing FastAPI app structure first and follow the current patterns.
- Add the official Microsoft Agent Framework dependency used by the current Python SDK/docs.
- Create a new backend feature for agent research, following the repo convention under `app/features/`.
- Expose an API that:
  - accepts a question
  - creates and runs a single research agent
  - streams step/tool events and the final answer
  - cleans up resources after the run
- Prefer the app’s existing streaming style if it already uses SSE or WebSockets.
- Keep the backend typed and production-shaped:
  - request/response schemas
  - clear error handling
  - no mock-only shortcuts unless clearly marked temporary

### Frontend

- Add a new use case for **Research Assistant Agent**.
- Keep the UI simple and demo-friendly:
  - left panel: live agent steps / tool trace
  - right panel: streamed answer
  - input box for the next question
- Wire it into the app’s existing use-case registry, marketplace, and workspace router.
- Add the necessary TypeScript types and feature module(s) in the same style as the existing use cases.

## Product constraints

- Use **Microsoft Agent Framework** for the agent layer, not custom orchestration.
- Start with one agent only.
- Do not add multi-agent planning, code execution, file search, or MCP-connected agents yet.
- If a search/grounding tool is available, use it so the demo visibly retrieves fresh information.
- Leave obvious extension points for future agents later.

## Suggested implementation shape

- `app/features/agent_research/`
  - `router.py`
  - `schemas.py`
  - `__init__.py`
- `frontend/src/features/agentResearch/`
  - `types.ts`
  - `api.ts`
  - `useAgentResearchStream.ts`
  - `AgentResearchWorkspace.tsx`
- Update the app’s shared use-case metadata so the new feature appears in the marketplace and workspace routing.

## Acceptance criteria

- A user can ask a question and see an agent respond through Microsoft Agent Framework.
- Tool use is visible in the UI.
- Streaming works end to end.
- The demo stays simple enough to showcase in under a minute.

