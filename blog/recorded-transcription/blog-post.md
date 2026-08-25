# Getting Started: Recorded Audio Transcription with Microsoft Foundry

Sometimes you just need a plain, accurate transcript of a recorded file — a meeting, a voicemail, an interview — without any chat or synthesis attached. Microsoft Foundry hosts speech-to-text models behind the same OpenAI-compatible audio API used elsewhere in this repo, so transcribing a file is a single call.

## What you need

1. A **Foundry resource** with a transcription model deployed (e.g. `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, or `MAI-Transcribe-1.5`).
2. **Azure CLI login** (`az login`) with the *Cognitive Services OpenAI User* role — no API keys to manage.
3. Two Python packages:

```bash
pip install openai azure-identity
```

## The core idea

Transcribing a local audio file is three steps:

1. **Authenticate** — get an Entra ID token scoped for Cognitive Services.
2. **Build an audio client** — an `AzureOpenAI` client pointed at your Foundry resource.
3. **Call `audio.transcriptions.create`** — pass the open file handle, read back `.text`.

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

with open("meeting.wav", "rb") as audio_file:
    response = client.audio.transcriptions.create(
        model="gpt-4o-transcribe",
        file=audio_file,
    )
print(response.text)
```

## The full script

The attached [`recorded_transcription.py`](Code/recorded_transcription.py) does exactly this against a local audio file. Set `ENDPOINT` and `TRANSCRIPTION_MODEL` to your own deployment, put your audio at `AUDIO_FILE_PATH`, and run:

```bash
python Code/recorded_transcription.py
```

## What we intentionally left out

The production Recorded Audio Transcription use case adds in-browser recording and upload, a choice between multiple transcription deployments (including an Azure Speech SDK path for continuous recognition), file-size limits, and telemetry/request logging. The fundamental call is unchanged: one file in, one transcript out via `audio.transcriptions.create`.

## Try it yourself

Drop any short WAV or MP3 file next to the script, update `AUDIO_FILE_PATH`, and run it to get a printed transcript in seconds.
