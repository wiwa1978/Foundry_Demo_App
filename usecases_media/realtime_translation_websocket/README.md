# Realtime Translation - GPT Realtime

Streams continuous browser microphone audio through FastAPI to the dedicated `gpt-realtime-translate` WebSocket endpoint. The session uses `gpt-realtime-whisper` for source transcription and returns source text, translated text, and translated PCM audio.

This is a separate implementation from the existing Azure Speech Live Interpreter use case.

| Layer | Location |
| --- | --- |
| Marketplace module | [`module.ts`](module.ts) |
| Frontend entry point | [`frontend.ts`](frontend.ts) |
| Shared frontend hook | [`frontend/src/features/voice/useRealtimeTranslation.ts`](../../frontend/src/features/voice/useRealtimeTranslation.ts) |
| Backend WebSocket proxy | [`../shared/voice/backend/websockets.py`](../shared/voice/backend/websockets.py) |
| Foundry integration | [`app/infrastructure/azure/foundry/realtime.py`](../../app/infrastructure/azure/foundry/realtime.py) |
