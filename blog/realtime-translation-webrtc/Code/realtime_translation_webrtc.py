# pip install websockets azure-identity

import asyncio
import base64
import json

import websockets
from azure.identity import DefaultAzureCredential

ENDPOINT = "https://<resource-name>.services.ai.azure.com/openai/v1"
MODEL = "gpt-realtime-translate"
TRANSCRIPTION_MODEL = "gpt-realtime-whisper"
SOURCE_LANGUAGE = "en"
TARGET_LANGUAGE = "fr"
INPUT_WAV = "input.wav"  # 24kHz mono 16-bit PCM; live mic capture omitted for simplicity
OUTPUT_PCM = "output.pcm"  # translated speech, 24kHz mono 16-bit PCM; speaker playback omitted

# NOTE: the browser production version negotiates WebRTC directly against
# /openai/v1/realtime/calls for lower latency. A standalone Python script has no
# realistic WebRTC client, so this uses the WebSocket transport of the exact same
# gpt-realtime-translate model + events instead.


async def main() -> None:
    # 1. Authenticate and open the dedicated realtime translation WebSocket
    token = DefaultAzureCredential().get_token("https://ai.azure.com/.default").token
    url = f"{ENDPOINT.replace('https://', 'wss://', 1)}/realtime/translations?model={MODEL}"
    headers = {"Authorization": f"Bearer {token}", "openai-alpha": "translation=v1"}

    async with websockets.connect(url, additional_headers=headers, max_size=None) as ws:
        # 2. Configure the source transcription and target output language
        await ws.send(json.dumps({
            "type": "session.update",
            "session": {
                "audio": {
                    "output": {"language": TARGET_LANGUAGE},
                    "input": {"transcription": {"model": TRANSCRIPTION_MODEL, "language": SOURCE_LANGUAGE}},
                }
            },
        }))
        while json.loads(await ws.recv())["type"] != "session.updated":
            pass

        # 3. Stream source audio in small chunks (read from a file instead of a mic)
        with open(INPUT_WAV, "rb") as f:
            audio = f.read()
        chunk_size = 3200  # ~100ms of 24kHz/16-bit mono audio
        for i in range(0, len(audio), chunk_size):
            chunk = base64.b64encode(audio[i : i + chunk_size]).decode()
            await ws.send(json.dumps({"type": "session.input_audio_buffer.append", "audio": chunk}))
            await asyncio.sleep(0.05)
        await ws.send(json.dumps({"type": "session.close"}))

        # 4. Read streamed translated text + audio until the session closes
        translated_audio = bytearray()
        async for message in ws:
            event = json.loads(message)
            if event["type"] == "session.output_transcript.delta":
                print(event.get("delta", ""), end="", flush=True)
            elif event["type"] == "session.output_audio.delta":
                translated_audio.extend(base64.b64decode(event["delta"]))
            elif event["type"] == "session.closed":
                break
        print()
        with open(OUTPUT_PCM, "wb") as f:
            f.write(translated_audio)


asyncio.run(main())
