# STT -> Chat -> TTS

Transcribes recorded speech, sends the text through chat, and synthesizes the response.

| Layer | Location |
| --- | --- |
| Marketplace module | [`module.ts`](module.ts) |
| Frontend entry point | [`frontend.ts`](frontend.ts) |
| Shared backend package | [`../shared/voice/backend`](../shared/voice/backend) |
| Frontend voice code | [`frontend/src/features/voice`](../../frontend/src/features/voice) |
| Backend voice API | [`../shared/voice/backend/router.py`](../shared/voice/backend/router.py) |
| Speech provider | [`app/providers/speech.py`](../../app/providers/speech.py) |
| Shared chat service | [`app/services/chat.py`](../../app/services/chat.py) |
| Backend tests | [`tests/test_voice_routes.py`](../../tests/test_voice_routes.py) |
