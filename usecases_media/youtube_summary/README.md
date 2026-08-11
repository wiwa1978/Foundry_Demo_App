# YouTube Video Summarization

Retrieves captions from a public YouTube video, falls back to bounded audio transcription, and summarizes the transcript.

| Layer | Location |
| --- | --- |
| Marketplace module | [`module.ts`](module.ts) |
| Frontend entry point | [`frontend.ts`](frontend.ts) |
| Backend entry point | [`backend.py`](backend.py) |
| Frontend | [`frontend/src/features/youtubeSummary`](../../frontend/src/features/youtubeSummary) |
| Backend API | [`app/features/youtube_summary`](../../app/features/youtube_summary) |
| Foundry chat gateway | [`app/gateways/foundry_chat.py`](../../app/gateways/foundry_chat.py) |
| Backend tests | [`tests/test_youtube_summary.py`](../../tests/test_youtube_summary.py) |
