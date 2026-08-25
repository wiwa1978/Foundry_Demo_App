# Getting Started: Realtime Voice (Speech In / Speech Out) with Microsoft Foundry

This is the conversational counterpart to text chat: speak into the mic, and a Foundry realtime model listens, thinks, and talks back — with audio streaming in both directions over one persistent connection instead of separate transcribe → chat → synthesize calls.

## What you need

1. A **Foundry project** with a realtime voice deployment (e.g. `gpt-realtime-2.1`).
2. **Azure CLI login** (`az login`) with the *Azure AI User* role — auth uses `DefaultAzureCredential` and a bearer token.
3. One Python package on top of `azure-identity`:

```bash
pip install websockets azure-identity
```

## The core idea

1. **Authenticate** and open the realtime WebSocket for your model.
2. **Configure the session** — instructions, output voice, and server-side voice-activity detection (VAD) so Foundry knows when you've finished talking.
3. **Stream your audio in**; server VAD auto-detects end of turn and triggers a spoken reply.
4. **Read the streamed reply** — transcript text and audio arrive together.

```python
await ws.send(json.dumps({
    "type": "session.update",
    "session": {
        "type": "realtime",
        "model": "gpt-realtime-2.1",
        "instructions": "You are a helpful voice assistant. Keep responses concise.",
        "output_modalities": ["audio"],
        "audio": {
            "input": {"turn_detection": {"type": "server_vad", "create_response": True}},
            "output": {"voice": "alloy"},
        },
    },
}))
```

| Event | Direction | Meaning |
| --- | --- | --- |
| `session.update` | client → server | set instructions, voice, turn detection |
| `input_audio_buffer.append` | client → server | send a base64 PCM16 audio chunk |
| `response.audio_transcript.delta` | server → client | next slice of the spoken reply's text |
| `response.audio.delta` | server → client | next slice of the spoken reply's audio |
| `response.done` | server → client | the reply is complete |

## The full script

The attached [`realtime_voice.py`](Code/realtime_voice.py) connects, configures the session, streams a local `input.wav` question, prints the reply text live, and writes the spoken reply to `output.pcm`.

```bash
python Code/realtime_voice.py
```

## What we intentionally left out

The production use case wires this up to live browser microphone capture and speaker playback (often over WebRTC for lower latency), plus guardrail policies, conversation persistence, telemetry, and reconnect/retry logic. All of that sits on top of the exact same `session.update` / `input_audio_buffer.append` / `response.audio.delta` protocol shown here.

## Try it yourself

Set `ENDPOINT`, `MODEL`, and `VOICE` in `Code/realtime_voice.py`, provide a 24kHz mono `input.wav` question, and run it to hear (well, read and decode) a real-time spoken reply.
