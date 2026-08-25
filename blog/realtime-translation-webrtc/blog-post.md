# Getting Started: Realtime Translation (WebRTC) with Microsoft Foundry

This is the browser-native counterpart to the WebSocket translation use case: the browser negotiates WebRTC directly against Foundry's `/openai/v1/realtime/calls` endpoint for `gpt-realtime-translate`, playing translated audio through the remote media track with the lowest possible latency. The same model and events are reachable from plain Python over a WebSocket, which is what this script uses.

## What you need

1. A **Foundry project** with `gpt-realtime-translate` (and optionally `gpt-realtime-whisper`) deployed.
2. **Azure CLI login** (`az login`) with the *Azure AI User* role — auth uses `DefaultAzureCredential` and a bearer token.
3. One Python package on top of `azure-identity`:

```bash
pip install websockets azure-identity
```

## The core idea

1. **Authenticate** and open the `/realtime/translations` WebSocket with the `openai-alpha: translation=v1` header.
2. **Configure the session** — target language and source transcription.
3. **Stream source audio** as `session.input_audio_buffer.append` events.
4. **Read translated text and audio** as they stream back.

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
| `session.output_audio.delta` | server → client | next slice of translated speech |
| `session.close` / `session.closed` | client → server / server → client | end the translation session |

## The full script

The attached [`realtime_translation_webrtc.py`](Code/realtime_translation_webrtc.py) connects over WebSocket, configures languages, streams a local `input.wav`, prints translated text, and writes translated audio to `output.pcm`.

```bash
python Code/realtime_translation_webrtc.py
```

## What we intentionally left out

The real WebRTC use case creates a short-lived Foundry client secret and negotiates a browser peer connection directly against `/openai/v1/realtime/calls`, streaming translated audio over the remote media track instead of a data channel. Note that current Foundry runtime behavior can reject `gpt-realtime-translate` WebRTC client-secret creation with `OperationNotSupported` — the WebSocket path used here is also the recommended fallback in production. There's no realistic standalone Python WebRTC client, so this script mirrors the same model and events over WebSocket. Also left out: guardrails, persistence, telemetry, and reconnect logic — the underlying session/event protocol is identical either way.

## Try it yourself

Set `ENDPOINT`, `MODEL`, and `TARGET_LANGUAGE` in `Code/realtime_translation_webrtc.py`, provide a 24kHz mono `input.wav`, and run it to see the same events the browser WebRTC path would use.
