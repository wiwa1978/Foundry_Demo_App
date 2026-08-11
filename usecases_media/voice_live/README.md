# Voice Live Travel Concierge

Implements the travel-concierge scenario over the Voice Live WebSocket flow.

| Layer | Location |
| --- | --- |
| Marketplace module | [`module.ts`](module.ts) |
| Frontend entry point | [`frontend.ts`](frontend.ts) |
| Backend entry point | [`backend.py`](backend.py) |
| Frontend voice code | [`frontend/src/features/voice`](../../frontend/src/features/voice) |
| Backend WebSocket | [`app/features/voice/websockets.py`](../../app/features/voice/websockets.py) |
| Realtime provider | [`app/providers/realtime.py`](../../app/providers/realtime.py) |
| Backend tests | [`tests/test_voice_live.py`](../../tests/test_voice_live.py) |
