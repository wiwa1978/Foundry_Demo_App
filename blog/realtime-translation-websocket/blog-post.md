# Getting Started: Realtime Translation (WebSocket) with Microsoft Foundry

Realtime translation takes a live speech stream in one language and produces translated text and translated speech in another — live captioning for international meetings, dubbed commentary, and more. Foundry exposes a dedicated `gpt-realtime-translate` Realtime WebSocket endpoint purpose-built for this.

## What you need

1. A **Foundry project** with `gpt-realtime-translate` (and optionally `gpt-realtime-whisper` for source transcription) deployed.
2. **Azure CLI login** (`az login`) with the *Azure AI User* role — auth uses `DefaultAzureCredential` and a bearer token.
3. One Python package on top of `azure-identity`:

```bash
pip install websockets azure-identity
```

## The core idea

1. **Authenticate** and open the `/realtime/translations` WebSocket for the translation model, with the `openai-alpha: translation=v1` header.
2. **Configure the session** — target output language, and optionally the source transcription model/language.
3. **Stream source audio** as `session.input_audio_buffer.append` events.
4. **Read translated text and audio** as they stream back, then close the session.

```python
await ws.send(json.dumps({
    "type": "session.update",
    "session": {
        "audio": {
            "output": {"language": "fr"},
            "input": {"transcription": {"model": "gpt-realtime-whisper", "language": "en"}},
        }
    },
}))
```

| Event | Direction | Meaning |
| --- | --- | --- |
| `session.update` | client → server | set target language + source transcription |
| `session.input_audio_buffer.append` | client → server | send a base64 PCM16 source-audio chunk |
| `session.output_transcript.delta` | server → client | next slice of translated text |
| `session.output_audio.delta` | server → client | next slice of translated speech (base64 PCM16) |
| `session.close` / `session.closed` | client → server / server → client | end the translation session |

## The full script

The attached [`realtime_translation_websocket.py`](Code/realtime_translation_websocket.py) connects, configures source/target languages, streams a local `input.wav`, prints translated text live, and writes the translated audio to `output.pcm`.

```bash
python Code/realtime_translation_websocket.py
```

## What we intentionally left out

The production use case streams continuous browser microphone audio through the app server, adds guardrail policies, conversation persistence, telemetry, and reconnect/retry handling around the proxy. All of that wraps the exact same `session.update` / `session.input_audio_buffer.append` / translation-delta protocol shown here — nothing about the core call changes.

## Try it yourself

Set `ENDPOINT`, `MODEL`, and `TARGET_LANGUAGE` in `Code/realtime_translation_websocket.py`, provide a 24kHz mono `input.wav` in your source language, and run it to see live translated captions plus a translated audio file.
