# Getting Started: Speech-to-Text → Chat → Text-to-Speech with Microsoft Foundry

This is the classic "voice assistant" pipeline: turn a spoken question into text, let a chat model answer it, then speak the answer back. All three steps run against Foundry-hosted models behind the same OpenAI-compatible audio and chat APIs — no separate services to wire together.

## What you need

1. A **Foundry resource** with a transcription model, a chat model, and a text-to-speech model deployed (e.g. `gpt-4o-mini-transcribe`, `gpt-4o-mini`, `gpt-4o-mini-tts`).
2. **Azure CLI login** (`az login`) with the *Cognitive Services OpenAI User* role — no API keys.
3. Two Python packages:

```bash
pip install openai azure-identity
```

## The core idea

One authenticated client, three calls in sequence:

1. **Speech-to-text** — `audio.transcriptions.create` turns the recorded question into a transcript.
2. **Chat** — `chat.completions.create` sends that transcript as a prompt and gets a text reply.
3. **Text-to-speech** — `audio.speech.create` turns the reply back into an audio file.

```python
transcription = client.audio.transcriptions.create(model="gpt-4o-mini-transcribe", file=audio_file)

chat_response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": transcription.text}],
)

speech_response = client.audio.speech.create(
    model="gpt-4o-mini-tts",
    voice="alloy",
    input=chat_response.choices[0].message.content,
    response_format="mp3",
)
speech_response.write_to_file("reply.mp3")
```

## The full script

The attached [`stt_chat_tts.py`](Code/stt_chat_tts.py) wires the three calls together end to end. Set `ENDPOINT` and the three model names at the top, put a recorded question at `INPUT_AUDIO_PATH`, then run:

```bash
python Code/stt_chat_tts.py
```

It prints the transcript and the assistant's text reply, and saves a spoken `reply.mp3` you can play back.

## What we intentionally left out

The production STT → Chat → TTS use case adds browser microphone capture and playback, conversation history so follow-up questions have context, guardrail policy variants compared side by side, persistence of every turn, and full request/response telemetry. The fundamentals are unchanged: it's still exactly these three calls, chained together.

## Try it yourself

Record yourself asking a short question, save it as `question.wav`, and run the script — you'll get a text transcript, a text reply, and an MP3 you can listen to, all from one script.
