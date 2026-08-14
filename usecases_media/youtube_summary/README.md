# YouTube Video Summarization

Retrieves captions from a public YouTube video, falls back to bounded audio transcription, and summarizes the transcript.

Audio fallback model choices include `gpt-transcribe`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, and `MAI-Transcribe-1.5`. Realtime-only models such as `gpt-live-transcribe` and `gpt-realtime-whisper` are for the realtime transcription demos, not this recorded-audio fallback.

| Layer | Location |
| --- | --- |
| Marketplace module | [`module.ts`](module.ts) |
| Frontend entry point | [`frontend.ts`](frontend.ts) |
| Backend package | [`backend`](backend) |
| Frontend | [`frontend/src/features/youtubeSummary`](../../frontend/src/features/youtubeSummary) |
| Backend API | [`backend/router.py`](backend/router.py) |
| Foundry chat gateway | [`app/gateways/foundry_chat.py`](../../app/gateways/foundry_chat.py) |
| Backend tests | [`tests/test_youtube_summary.py`](../../tests/test_youtube_summary.py) |
