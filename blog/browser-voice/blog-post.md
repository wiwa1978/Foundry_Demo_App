# Getting Started: Browser Voice with Microsoft Foundry

The "browser voice" experience lets a user talk to a chatbot with their microphone instead of typing. The browser itself handles capturing the microphone and speaking replies out loud — but the piece that actually understands *what was said* is a server-side speech-to-text call to a Foundry-hosted audio model. This post shows that core call in isolation.

## What you need

1. A **Foundry resource** with an audio transcription model deployed (e.g. `gpt-4o-mini-transcribe`).
2. **Azure CLI login** (`az login`) with the *Cognitive Services OpenAI User* role on the resource — no API keys.
3. Two Python packages:

```bash
pip install openai azure-identity
```

## The core idea

Turning recorded speech into text is three steps:

1. **Authenticate** — get an Entra ID token scoped for Cognitive Services.
2. **Build an audio client** — an `AzureOpenAI` client pointed at your Foundry resource.
3. **Call `audio.transcriptions.create`** — send the audio bytes, get text back.

```python
from openai import AzureOpenAI
from azure.identity import DefaultAzureCredential, get_bearer_token_provider

token_provider = get_bearer_token_provider(
    DefaultAzureCredential(), "https://cognitiveservices.azure.com/.default"
)
client = AzureOpenAI(
    azure_endpoint="https://<resource-name>.openai.azure.com",
    api_version="2025-04-01-preview",
    azure_ad_token_provider=token_provider,
)

with open("recording.webm", "rb") as audio_file:
    response = client.audio.transcriptions.create(
        model="gpt-4o-mini-transcribe",
        file=audio_file,
    )
print(response.text)
```

## The full script

The attached [`browser_voice.py`](Code/browser_voice.py) runs this end to end against a local audio file standing in for a browser recording. Set `ENDPOINT` and `TRANSCRIPTION_MODEL`, put a short audio clip at `AUDIO_FILE_PATH`, then run:

```bash
python Code/browser_voice.py
```

## What we intentionally left out

The production Browser Voice use case captures audio directly from the microphone using the browser's `MediaRecorder` API, streams it to the backend as it's recorded, plays the assistant's reply back through the browser's speech synthesis, and wraps all of it in conversation persistence, guardrail policy comparisons, and telemetry. None of that changes the fundamental call shown here — it's still one `audio.transcriptions.create` request per recording.

## Try it yourself

Record a few seconds of speech with any tool that saves to WAV/WebM, point `AUDIO_FILE_PATH` at it, and run the script to see your voice turned into text in under a second.
