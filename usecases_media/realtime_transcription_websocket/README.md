# Realtime Transcription - WebSockets

Converts browser microphone audio to 24 kHz PCM16 and proxies it through FastAPI to a `gpt-realtime-whisper` Realtime WebSocket session.

The workspace supports an optional ISO language hint, transcription delay tuning, app-side silence commits, server VAD, and semantic VAD. App-side commits use a 900 ms silence boundary, a 500 ms minimum utterance, a 12 second maximum window, and graceful finalization on stop.

| Layer | Location |
| --- | --- |
| Marketplace module | [`module.ts`](module.ts) |
| Frontend entry point | [`frontend.ts`](frontend.ts) |
| Shared frontend hook | [`frontend/src/features/voice/useRealtimeTranscription.ts`](../../frontend/src/features/voice/useRealtimeTranscription.ts) |
| Backend WebSocket proxy | [`../shared/voice/backend/websockets.py`](../shared/voice/backend/websockets.py) |
| Foundry integration | [`app/infrastructure/azure/foundry/realtime.py`](../../app/infrastructure/azure/foundry/realtime.py) |
