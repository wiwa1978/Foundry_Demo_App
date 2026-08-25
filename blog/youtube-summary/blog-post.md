# Getting Started: YouTube Video Summarization with Microsoft Foundry

Watching a long YouTube video just to know if it's worth your time is wasteful. This capability pulls the video's caption track and asks a chat model to summarize it — no video download, no audio processing, just captions in and a summary out.

## What you need

1. A **Foundry resource** with a chat model deployed (e.g. `gpt-4o-mini`).
2. **Azure CLI login** (`az login`) with the *Cognitive Services OpenAI User* role — no API keys.
3. Two Python packages:

```bash
pip install youtube-transcript-api openai azure-identity
```

## The core idea

Summarizing a video is two steps:

1. **Fetch captions** — `youtube-transcript-api` downloads the manual or auto-generated caption track for a video ID.
2. **Summarize** — send the joined caption text to a chat model as the prompt.

```python
from youtube_transcript_api import YouTubeTranscriptApi

snippets = YouTubeTranscriptApi().list(VIDEO_ID).find_transcript(["en"]).fetch()
transcript = "\n".join(snippet.text for snippet in snippets)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": "Summarize the video captions concisely."},
        {"role": "user", "content": transcript},
    ],
)
print(response.choices[0].message.content)
```

## The full script

The attached [`youtube_summary.py`](Code/youtube_summary.py) runs both steps against a real video. Set `ENDPOINT`, `CHAT_MODEL`, and `VIDEO_ID` (the 11-character id from a `youtube.com/watch?v=...` URL), then run:

```bash
python Code/youtube_summary.py
```

## What we intentionally left out

The production YouTube Summarization use case validates and parses arbitrary YouTube URL formats, falls back to downloading and transcribing the audio track (via `yt-dlp` and a Foundry transcription model) when no captions exist, chunks very long transcripts into map-reduce summarization passes, and adds guardrails, telemetry, and usage tracking. The fundamentals shown here — fetch captions, summarize with chat — are exactly what powers all of that underneath.

## Try it yourself

Pick a YouTube video with captions enabled, drop its video ID into `VIDEO_ID`, and run the script to get an instant AI-written summary.
