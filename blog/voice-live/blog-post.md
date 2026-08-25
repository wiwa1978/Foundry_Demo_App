# Getting Started: Voice Live Travel Concierge with Microsoft Foundry

Azure AI Voice Live gives you a fully managed conversational voice agent endpoint — instructions in, natural speech out — tuned for scenarios like a travel concierge that listens to a traveler's request and speaks back a helpful, on-brand reply, all over one realtime WebSocket connection.

## What you need

1. An **Azure AI Voice Live** endpoint (a Foundry or Azure Speech resource with Voice Live enabled) and a model deployment (e.g. `gpt-realtime`).
2. **Azure CLI login** (`az login`) with the *Azure AI User* role — auth uses `DefaultAzureCredential` and a bearer token.
3. One Python package on top of `azure-identity`:

```bash
pip install websockets azure-identity
```

## The core idea

1. **Authenticate** and open the Voice Live realtime WebSocket, negotiating the `realtime` subprotocol.
2. **Configure the agent** — persona instructions, an Azure neural voice, and voice-activity detection.
3. **Stream the traveler's spoken question in.**
4. **Read the concierge's streamed spoken reply.**

```python
await ws.send(json.dumps({
    "type": "session.update",
    "session": {
        "instructions": "You are a friendly travel concierge. Help the caller plan a trip.",
        "voice": {"name": "en-US-Ava:DragonHDLatestNeural", "type": "azure-standard"},
        "input_audio_format": "pcm16",
        "output_audio_format": "pcm16",
        "turn_detection": {"type": "server_vad", "threshold": 0.5},
    },
}))
```

| Event | Direction | Meaning |
| --- | --- | --- |
| `session.update` | client → server | set persona instructions, voice, formats, VAD |
| `input_audio_buffer.append` | client → server | send a base64 PCM16 audio chunk |
| `response.audio_transcript.delta` | server → client | next slice of the concierge's reply text |
| `response.audio.delta` | server → client | next slice of the concierge's reply audio |
| `response.done` | server → client | the reply is complete |

## The full script

The attached [`voice_live.py`](Code/voice_live.py) connects to the Voice Live endpoint, configures the travel-concierge persona, streams a local `input.wav`, prints the reply text live, and writes the spoken reply to `output.pcm`.

```bash
python Code/voice_live.py
```

## What we intentionally left out

The production travel-concierge experience adds live browser microphone/speaker capture, an avatar rendering path, guardrail policies, conversation persistence, telemetry, and reconnect/retry logic around the WebSocket proxy. The fundamentals — connecting to the Voice Live endpoint, sending `session.update`, and streaming audio in/out — are identical to what's shown here.

## Try it yourself

Set `ENDPOINT`, `MODEL`, `VOICE`, and `INSTRUCTIONS` in `Code/voice_live.py` to your own Voice Live deployment and persona, provide an `input.wav` question, and run it to get a spoken concierge reply.
