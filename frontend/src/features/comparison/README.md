# Comparison implementation

- [`api.ts`](./api.ts): browser contract for one prompt across multiple models.
- [Comparison FastAPI router](../../../../usecases_media/text_chat_comparison/backend/router.py)
- [Shared chat service](../../../../app/services/chat.py)
- [Comparison route tests](../../../../tests/test_comparison_api.py)

The comparison router creates one scoped conversation turn, builds model-specific history, invokes
the shared chat service concurrently, and persists one assistant result per selected deployment.
