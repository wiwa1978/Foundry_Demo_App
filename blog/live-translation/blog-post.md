# Getting Started: Live Translation with Microsoft Foundry

Live Translation streams speech in one language and produces spoken translated audio in another — a live interpreter for meetings, calls, and support lines. Unlike the GPT Realtime translation use case, this is powered directly by the Azure AI Speech SDK's continuous speech-translation recognizer.

## What you need

1. An **Azure AI Speech** resource (custom-domain endpoint like `https://<resource-name>.cognitiveservices.azure.com`).
2. **Azure CLI login** (`az login`) with an Entra ID role that can use the Speech resource — auth uses `DefaultAzureCredential` as a `token_credential`, no key required.
3. One Python package on top of `azure-identity`:

```bash
pip install azure-cognitiveservices-speech azure-identity
```

## The core idea

1. **Authenticate and configure** a `SpeechTranslationConfig` with the source recognition language, a target language, and a target voice.
2. **Point it at your audio** — a `PushAudioInputStream`/`AudioConfig` in production for live mic audio, a WAV file here for simplicity.
3. **Subscribe to events** for partial/final translated text and streamed translated-speech audio.
4. **Run continuous recognition** until the audio ends.

```python
translation_config = speechsdk.translation.SpeechTranslationConfig(
    endpoint=SPEECH_ENDPOINT, token_credential=DefaultAzureCredential()
)
translation_config.speech_recognition_language = "en-US"
translation_config.add_target_language("fr")
translation_config.voice_name = "fr-FR-DeniseNeural"
recognizer = speechsdk.translation.TranslationRecognizer(
    translation_config=translation_config, audio_config=audio_config
)
```

| Callback | Fires when | Payload |
| --- | --- | --- |
| `recognizing` | partial translation available | in-progress translated text |
| `recognized` | an utterance is finalized | final translated text |
| `synthesizing` | translated speech audio arrives | a chunk of PCM16 audio |
| `session_stopped` / `canceled` | the session ends | — |

## The full script

The attached [`live_translation.py`](Code/live_translation.py) configures the recognizer, streams a local `input.wav`, prints translated captions live, and appends translated audio chunks to `output.raw` as they arrive.

```bash
python Code/live_translation.py
```

## What we intentionally left out

The production Live Translation use case streams live browser microphone audio through an audio worklet and a WebSocket proxy, supports both a "standard" mode (fixed source/target languages) and a "personal voice" mode (auto-detected source language via the Universal v2 endpoint), and adds guardrails, telemetry, and reconnect logic. The core translation call — configuring a `SpeechTranslationConfig` and listening to recognizer events — is exactly what's shown here.

## Try it yourself

Set `SPEECH_ENDPOINT`, `SOURCE_LANGUAGE`, and `TARGET_LANGUAGE` in `Code/live_translation.py`, provide a 16kHz mono `input.wav`, and run it to get live translated captions plus a translated audio file.
