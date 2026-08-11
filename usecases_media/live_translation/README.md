# Live Translation

Streams microphone audio to Azure Speech Live Interpreter and plays translated audio.

| Layer | Location |
| --- | --- |
| Marketplace module | [`module.ts`](module.ts) |
| Frontend entry point | [`frontend.ts`](frontend.ts) |
| Backend entry point | [`backend.py`](backend.py) |
| Frontend voice code | [`frontend/src/features/voice`](../../frontend/src/features/voice) |
| Audio worklet | [`frontend/src/live-interpreter-worklet.js`](../../frontend/src/live-interpreter-worklet.js) |
| Backend WebSocket | [`app/features/voice/websockets.py`](../../app/features/voice/websockets.py) |
| Live Interpreter integration | [`app/live_interpreter.py`](../../app/live_interpreter.py) |
| Backend tests | [`tests/test_live_interpreter.py`](../../tests/test_live_interpreter.py) |
