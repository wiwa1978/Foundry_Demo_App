# pip install websockets azure-identity

import asyncio
import base64
import json

import websockets
from azure.identity import DefaultAzureCredential

ENDPOINT = "https://<resource-name>.services.ai.azure.com"
MODEL = "gpt-realtime"
VOICE = "en-US-Ava:DragonHDLatestNeural"
API_VERSION = "2026-01-01-preview"
INSTRUCTIONS = "You are a friendly travel concierge. Help the caller plan and book a trip."
INPUT_WAV = "input.wav"  # 16-bit PCM traveler question; live mic capture omitted for simplicity
OUTPUT_PCM = "output.pcm"  # spoken reply; speaker playback omitted


async def main() -> None:
    # 1. Authenticate and open the Voice Live realtime WebSocket
    token = DefaultAzureCredential().get_token("https://ai.azure.com/.default").token
    url = (
        f"{ENDPOINT.replace('https://', 'wss://', 1)}/voice-live/realtime/calls"
        f"?api-version={API_VERSION}&model={MODEL}"
    )
    headers = {"Authorization": f"Bearer {token}"}

    async with websockets.connect(url, additional_headers=headers, subprotocols=["realtime"]) as ws:
        # 2. Configure the travel-concierge voice agent (instructions, voice, turn detection)
        await ws.send(json.dumps({
            "type": "session.update",
            "session": {
                "instructions": INSTRUCTIONS,
                "voice": {"name": VOICE, "type": "azure-standard"},
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "turn_detection": {"type": "server_vad", "threshold": 0.5, "silence_duration_ms": 500},
            },
        }))

        # 3. Stream the traveler's spoken question in
        with open(INPUT_WAV, "rb") as f:
            audio = f.read()
        chunk_size = 3200  # ~100ms of 24kHz/16-bit mono audio
        for i in range(0, len(audio), chunk_size):
            chunk = base64.b64encode(audio[i : i + chunk_size]).decode()
            await ws.send(json.dumps({"type": "input_audio_buffer.append", "audio": chunk}))
            await asyncio.sleep(0.05)

        # 4. Read the concierge's streamed spoken reply until the response completes
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
