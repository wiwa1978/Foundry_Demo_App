# Side by Side - Recorded Audio Transcription

Runs one recording through multiple transcription deployments for side-by-side comparison.

| Layer | Location |
| --- | --- |
| Marketplace module | [`module.ts`](module.ts) |
| Frontend entry point | [`frontend.ts`](frontend.ts) |
| Shared backend package | [`../shared/voice/backend`](../shared/voice/backend) |
| Frontend voice code | [`frontend/src/features/voice`](../../frontend/src/features/voice) |
| Backend voice API | [`../shared/voice/backend/router.py`](../shared/voice/backend/router.py) |
| Speech provider | [`app/providers/speech.py`](../../app/providers/speech.py) |
| Frontend tests | [`frontend/src/features/voice/useTranscriptionSession.test.tsx`](../../frontend/src/features/voice/useTranscriptionSession.test.tsx) |
