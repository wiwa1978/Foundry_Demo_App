# Live Translation

Streams microphone audio to Azure Speech Live Interpreter and plays translated audio.

| Layer | Location |
| --- | --- |
| Marketplace module | [`module.ts`](module.ts) |
| Frontend entry point | [`frontend.ts`](frontend.ts) |
| Shared backend package | [`../shared/voice/backend`](../shared/voice/backend) |
| Frontend voice code | [`frontend/src/features/voice`](../../frontend/src/features/voice) |
| Audio worklet | [`frontend/src/live-interpreter-worklet.js`](../../frontend/src/live-interpreter-worklet.js) |
| Backend WebSocket | [`../shared/voice/backend/websockets.py`](../shared/voice/backend/websockets.py) |
| Live Interpreter integration | [`app/live_interpreter.py`](../../app/live_interpreter.py) |
| Backend tests | [`tests/test_live_interpreter.py`](../../tests/test_live_interpreter.py) |
