# Voice implementations

This folder maps the voice use cases shown in the marketplace to executable code.

## HTTP APIs

- [`api.ts`](./api.ts): realtime session tokens and recorded transcription requests.
- [Voice HTTP router](../../../../usecases_media/shared/voice/backend/router.py)
- [Traditional voice route](../../../../app/main.py) combines transcription, shared chat orchestration and TTS.

## Realtime transports

- Realtime WebRTC session setup starts in [`app/AppWorkspace.tsx`](../../app/AppWorkspace.tsx) and obtains an ephemeral token through the voice router.
- Voice Live WebSocket proxy: [`voice_live_proxy`](../../../../app/main.py)
- Live Interpreter WebSocket session: [`live_interpreter`](../../../../app/main.py)
- Speech SDK session wrapper: [`live_interpreter.py`](../../../../app/live_interpreter.py)
- Browser audio worklet: [`live-interpreter-worklet.js`](../../live-interpreter-worklet.js)

The WebSocket handlers remain in the application transport module until dedicated live-session
integration tests cover upstream connection cancellation and browser disconnects.

## Tests

- [Voice route tests](../../../../tests/test_voice_routes.py)
- Existing provider tests: [`test_voice_live.py`](../../../../tests/test_voice_live.py),
  [`test_live_interpreter.py`](../../../../tests/test_live_interpreter.py), and
  [`test_speech_transcription.py`](../../../../tests/test_speech_transcription.py).
