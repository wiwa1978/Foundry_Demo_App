# Getting Started: Realtime Transcription (WebSocket) with Microsoft Foundry

Realtime transcription turns a live audio stream into text as the speaker talks — captions, meeting notes, and voice search all need this. Microsoft Foundry exposes this as a Realtime API session in "transcription" mode: you stream PCM16 audio in and get transcript deltas back over the same connection, no polling required.

## What you need

1. A **Foundry project** with a realtime transcription deployment (e.g. `gpt-realtime-whisper` or `gpt-live-transcribe`).
2. **Azure CLI login** (`az login`) with the *Azure AI User* role — auth uses `DefaultAzureCredential` and a bearer token, no API keys.
3. One Python package on top of `azure-identity`:

```bash
pip install websockets azure-identity
```

## The core idea

1. **Authenticate** — get a bearer token for the `https://ai.azure.com/.default` scope.
2. **Open the realtime WebSocket** in transcription mode and send `session.update` to pick the model, audio format, and turn detection.
3. **Stream PCM16 audio** as `input_audio_buffer.append` events, then `commit` when you're done.
4. **Read transcript events** as they arrive.

```python
await ws.send(json.dumps({
    "type": "session.update",
    "session": {
        "type": "transcription",
        "audio": {"input": {
            "format": {"type": "audio/pcm", "rate": 24000},
            "transcription": {"model": "gpt-realtime-whisper", "language": "en"},
            "turn_detection": {"type": "server_vad", "threshold": 0.5, "silence_duration_ms": 900},
        }},
    },
}))
```

| Event | Direction | Meaning |
| --- | --- | --- |
| `session.update` | client → server | configure model, audio format, VAD |
| `input_audio_buffer.append` | client → server | send a base64 PCM16 audio chunk |
| `conversation.item.input_audio_transcription.delta` | server → client | next slice of transcript text |
| `conversation.item.input_audio_transcription.completed` | server → client | the utterance is fully transcribed |

## The full script

The attached [`realtime_transcription_websocket.py`](Code/realtime_transcription_websocket.py) connects, configures the session, streams a local `input.wav`, and prints the transcript as it streams in.

```bash
python Code/realtime_transcription_websocket.py
```

## What we intentionally left out

The production use case adds live microphone capture in the browser, app-side silence-commit heuristics, guardrail policies, conversation persistence, telemetry, and reconnect/retry logic around the WebSocket proxy. None of that changes the underlying protocol — it's the exact same `session.update` / `input_audio_buffer.append` / transcription-delta events shown here, just wrapped with production-grade plumbing.

## Try it yourself

Set `ENDPOINT` and `MODEL` in `Code/realtime_transcription_websocket.py` to your own Foundry deployment, drop a 24kHz mono WAV file in as `input.wav`, and run it — you'll see live transcript text stream to your terminal.
