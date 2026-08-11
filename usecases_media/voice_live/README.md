# Voice Live Travel Concierge

Implements the travel-concierge scenario over the Voice Live WebSocket flow.

| Layer | Location |
| --- | --- |
| Marketplace module | [`module.ts`](module.ts) |
| Frontend entry point | [`frontend.ts`](frontend.ts) |
| Shared backend package | [`../shared/voice/backend`](../shared/voice/backend) |
| Frontend voice code | [`frontend/src/features/voice`](../../frontend/src/features/voice) |
| Backend WebSocket | [`../shared/voice/backend/websockets.py`](../shared/voice/backend/websockets.py) |
| Realtime provider | [`app/providers/realtime.py`](../../app/providers/realtime.py) |
| Backend tests | [`tests/test_voice_live.py`](../../tests/test_voice_live.py) |
