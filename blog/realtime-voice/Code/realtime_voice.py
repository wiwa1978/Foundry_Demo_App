# pip install websockets azure-identity

import asyncio
import base64
import json

import websockets
from azure.identity import DefaultAzureCredential

ENDPOINT = "https://<resource-name>.services.ai.azure.com/openai/v1"
MODEL = "gpt-realtime-2.1"
VOICE = "alloy"
INPUT_WAV = "input.wav"  # 24kHz mono 16-bit PCM question; live mic capture omitted for simplicity
OUTPUT_PCM = "output.pcm"  # spoken reply, 24kHz mono 16-bit PCM; speaker playback omitted


async def main() -> None:
    # 1. Authenticate and open the realtime WebSocket
    token = DefaultAzureCredential().get_token("https://ai.azure.com/.default").token
    url = f"{ENDPOINT.replace('https://', 'wss://', 1)}/realtime?model={MODEL}"
    headers = {"Authorization": f"Bearer {token}"}

    async with websockets.connect(url, additional_headers=headers, max_size=None) as ws:
        # 2. Configure a speech-in / speech-out session with server-side turn detection
        await ws.send(json.dumps({
            "type": "session.update",
            "session": {
                "type": "realtime",
                "model": MODEL,
                "instructions": "You are a helpful voice assistant. Keep responses concise.",
                "output_modalities": ["audio"],
                "audio": {
                    "input": {
                        "transcription": {"model": "whisper-1"},
                        "turn_detection": {
                            "type": "server_vad",
                            "threshold": 0.5,
                            "prefix_padding_ms": 300,
                            "silence_duration_ms": 500,
                            "create_response": True,
                        },
                    },
                    "output": {"voice": VOICE},
                },
            },
        }))

        # 3. Stream the caller's audio in; server VAD detects end-of-turn and auto-replies
        with open(INPUT_WAV, "rb") as f:
            audio = f.read()
        chunk_size = 3200  # ~100ms of 24kHz/16-bit mono audio
        for i in range(0, len(audio), chunk_size):
            chunk = base64.b64encode(audio[i : i + chunk_size]).decode()
            await ws.send(json.dumps({"type": "input_audio_buffer.append", "audio": chunk}))
            await asyncio.sleep(0.05)

        # 4. Read the streamed spoken reply (text + audio deltas) until it completes
        reply_audio = bytearray()
        async for message in ws:
            event = json.loads(message)
            if event["type"] == "response.audio_transcript.delta":
                print(event.get("delta", ""), end="", flush=True)
            elif event["type"] == "response.audio.delta":
                reply_audio.extend(base64.b64decode(event["delta"]))
            elif event["type"] == "response.done":
                break
        print()
        with open(OUTPUT_PCM, "wb") as f:
            f.write(reply_audio)


asyncio.run(main())
