# pip install websockets azure-identity

import asyncio
import base64
import json

import websockets
from azure.identity import DefaultAzureCredential

ENDPOINT = "https://<resource-name>.services.ai.azure.com/openai/v1"
MODEL = "gpt-realtime-whisper"  # or "gpt-live-transcribe"
LANGUAGE = "en"
INPUT_WAV = "input.wav"  # 24kHz mono 16-bit PCM; live mic capture omitted for simplicity

# NOTE: the browser production version negotiates WebRTC (lower latency, no app-server
# hop). A standalone Python script has no realistic WebRTC client, so this uses the
# WebSocket transport of the exact same realtime model + events instead.


async def main() -> None:
    # 1. Authenticate and open the realtime WebSocket in "transcription" mode
    token = DefaultAzureCredential().get_token("https://ai.azure.com/.default").token
    url = f"{ENDPOINT.replace('https://', 'wss://', 1)}/realtime?intent=transcription"
    headers = {"Authorization": f"Bearer {token}"}

    async with websockets.connect(url, additional_headers=headers, max_size=None) as ws:
        # 2. Configure the transcription session (model, format, server VAD)
        await ws.send(json.dumps({
            "type": "session.update",
            "session": {
                "type": "transcription",
                "audio": {
                    "input": {
                        "format": {"type": "audio/pcm", "rate": 24000},
                        "transcription": {"model": MODEL, "language": LANGUAGE},
                        "turn_detection": {
                            "type": "server_vad",
                            "threshold": 0.5,
                            "prefix_padding_ms": 300,
                            "silence_duration_ms": 900,
                        },
                    }
                },
            },
        }))

        # 3. Stream raw PCM16 audio in small chunks (read from a file instead of a mic)
        with open(INPUT_WAV, "rb") as f:
            audio = f.read()
        chunk_size = 3200  # ~100ms of 24kHz/16-bit mono audio
        for i in range(0, len(audio), chunk_size):
            chunk = base64.b64encode(audio[i : i + chunk_size]).decode()
            await ws.send(json.dumps({"type": "input_audio_buffer.append", "audio": chunk}))
            await asyncio.sleep(0.05)
        await ws.send(json.dumps({"type": "input_audio_buffer.commit"}))

        # 4. Read streamed transcript deltas until the item completes
        async for message in ws:
            event = json.loads(message)
            if event["type"] == "conversation.item.input_audio_transcription.delta":
                print(event.get("delta", ""), end="", flush=True)
            elif event["type"] == "conversation.item.input_audio_transcription.completed":
                print()
                break


asyncio.run(main())
