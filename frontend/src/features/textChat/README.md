# Text Chat implementation

This folder is the customer-facing entry point for the Text Chat use case.

## Request flow

1. [`useChatStream.ts`](./useChatStream.ts) owns cancellation and applies the shared chat stream state machine.
2. [`api.ts`](./api.ts) sends the typed request to `POST /api/chat/stream`.
3. [`sse.ts`](./sse.ts) parses incremental Server-Sent Events.
4. [`types.ts`](./types.ts) documents the browser/API contract.
5. [`app/AppWorkspace.tsx`](../../app/AppWorkspace.tsx) supplies workspace state and concise text/document adapters.

## Backend flow

- [FastAPI router](../../../../app/features/text_chat/router.py)
- [Chat orchestration service](../../../../app/services/chat.py)
- [Foundry gateway](../../../../app/gateways/foundry_chat.py)
- [Conversation persistence facade](../../../../app/conversation_store.py)
- [Request schema](../../../../app/schemas.py)

The router exposes `POST /api/chat` and `POST /api/chat/stream`. The service builds scoped
conversation history, applies model settings and optional guardrails, invokes Foundry through the
gateway, and persists the assistant result. The streaming endpoint emits `start`, trace, `delta`, and
terminal `completed` or `error` events.

## Tests

- [Backend API contracts](../../../../tests/test_text_chat_api.py)
- [Frontend request tests](./api.test.ts)
- [SSE parser tests](./sse.test.ts)

Run `python -m pytest -q tests/test_text_chat_api.py` and, from `frontend`, `npm run test`.
