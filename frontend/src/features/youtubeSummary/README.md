# YouTube Video Summarization

This use case accepts a public HTTPS YouTube video URL and retrieves an available creator or
auto-generated caption track. When captions are unavailable, it downloads and transcribes the
audio with the selected transcription model before summarizing it with the Foundry chat model.

## Implementation map

- `YouTubeSummaryWorkspace.tsx` renders the URL, language, model, summary, and transcript UI.
- `useYouTubeSummary.ts` owns request state and forwards provider traces to the shared trace drawer.
- `api.ts` calls `POST /api/youtube/summarize`.
- `usecases_media/youtube_summary/backend/service.py` validates URLs, retrieves captions, performs a bounded
  `yt-dlp`/FFmpeg audio fallback, chunks long transcripts, and summarizes them hierarchically.

## Limits

Audio fallback supports public videos up to 30 minutes. YouTube may block caption and media
requests from cloud IP addresses. Private, age-restricted, and regional videos are not supported.
The deployment image installs a hash-pinned `yt-dlp` wheel. The Microsoft package proxy cannot
serve this package, so local development installs the exact official GitHub tag into the Python
environment running FastAPI:

```powershell
python -m pip install --no-deps "git+https://github.com/yt-dlp/yt-dlp.git@2026.03.17"
```

Foundry transcription consumes the downloaded M4A directly. Azure Speech additionally requires
FFmpeg to convert that audio to WAV; the deployment image includes FFmpeg, while local Azure
Speech development requires it on `PATH`.
