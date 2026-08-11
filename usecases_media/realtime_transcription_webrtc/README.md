# Realtime Transcription - WebRTC

Streams the browser microphone directly to a `gpt-realtime-whisper` deployment and receives transcript events over the WebRTC data channel.

The workspace supports an optional ISO language hint, transcription delay tuning, and server or semantic VAD. Foundry owns turn segmentation because media bypasses the app server.

| Layer | Location |
| --- | --- |
| Marketplace module | [`module.ts`](module.ts) |
| Frontend entry point | [`frontend.ts`](frontend.ts) |
| Shared frontend hook | [`frontend/src/features/voice/useRealtimeTranscription.ts`](../../frontend/src/features/voice/useRealtimeTranscription.ts) |
| Backend session API | [`../shared/voice/backend/router.py`](../shared/voice/backend/router.py) |
| Foundry integration | [`app/infrastructure/azure/foundry/realtime.py`](../../app/infrastructure/azure/foundry/realtime.py) |
