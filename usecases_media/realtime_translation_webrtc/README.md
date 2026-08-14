# GPT Realtime Translation - WebRTC

Creates a short-lived Foundry Realtime session for `gpt-realtime-translate`, negotiates browser WebRTC directly with `/openai/v1/realtime/calls`, and displays translated text while translated audio plays through the remote media track.

This is the browser-native counterpart to the backend-mediated WebSocket translation use case. Current Foundry runtime behavior can reject `gpt-realtime-translate` WebRTC client-secret creation with `OperationNotSupported`; when that happens the app reports the provider limitation instead of a generic failure.

| Layer | Location |
| --- | --- |
| Marketplace module | [`module.ts`](module.ts) |
| Frontend entry point | [`frontend.ts`](frontend.ts) |
| Shared frontend hook | [`frontend/src/features/voice/useRealtimeTranslation.ts`](../../frontend/src/features/voice/useRealtimeTranslation.ts) |
| Backend session endpoint | [`../shared/voice/backend/router.py`](../shared/voice/backend/router.py) |
| Foundry integration | [`app/infrastructure/azure/foundry/realtime.py`](../../app/infrastructure/azure/foundry/realtime.py) |
