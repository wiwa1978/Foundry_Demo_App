# Getting Started: Realtime Transcription (WebRTC) with Microsoft Foundry

The browser version of this capability streams the microphone directly to Foundry over WebRTC for the lowest possible latency, with transcript events arriving on a WebRTC data channel. The same `gpt-realtime-whisper` / `gpt-live-transcribe` model and event protocol is reachable from plain Python over a WebSocket — that's what we'll use here.

## What you need

1. A **Foundry project** with a realtime transcription deployment (e.g. `gpt-realtime-whisper` or `gpt-live-transcribe`).
2. **Azure CLI login** (`az login`) with the *Azure AI User* role — auth uses `DefaultAzureCredential` and a bearer token.
3. One Python package on top of `azure-identity`:

```bash
pip install websockets azure-identity
```

## The core idea

1. **Authenticate** — get a bearer token for `https://ai.azure.com/.default`.
2. **Open the realtime WebSocket** in transcription mode with `session.update`.
3. **Stream PCM16 audio** as `input_audio_buffer.append` events, then `commit`.
4. **Read transcript deltas** until the utterance completes.

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

The attached [`realtime_transcription_webrtc.py`](Code/realtime_transcription_webrtc.py) connects over WebSocket, configures the session, streams a local `input.wav`, and prints the transcript as it arrives.

```bash
python Code/realtime_transcription_webrtc.py
```

## What we intentionally left out

The real "WebRTC" use case negotiates a peer connection directly from the browser to Foundry's `/openai/v1/realtime/calls` endpoint using a short-lived client secret, streaming the live microphone and receiving transcripts over a low-latency data channel — no app-server audio hop at all. There's no realistic standalone WebRTC client in plain Python, so this script uses the WebSocket transport of the identical model and events instead. Also left out: guardrails, conversation persistence, telemetry, and reconnect logic. The fundamentals — the session/event protocol — are exactly the same either way.

## Try it yourself

Set `ENDPOINT` and `MODEL` in `Code/realtime_transcription_webrtc.py` to your own deployment, provide a 24kHz mono `input.wav`, and run it to see the same transcription events the browser WebRTC path uses.
