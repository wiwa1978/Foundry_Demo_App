import base64
import os
import tempfile
import threading
import time
from io import BytesIO
from typing import Any

from app.azure_credential import get_azure_credential
from app.providers.clients import create_audio_client
from app.providers.settings import load_settings


def transcribe_audio(
    *,
    audio: bytes,
    filename: str,
    content_type: str | None = None,
    model: str | None = None,
) -> dict[str, Any]:
    settings = load_settings()
    if not settings.endpoint:
        raise RuntimeError(
            "Foundry transcription is not configured. Set FOUNDRY_PROJECT_ENDPOINT."
        )

    transcription_model = (model or settings.transcription_model).strip()
    if not transcription_model:
        raise RuntimeError(
            "Set FOUNDRY_TRANSCRIPTION_MODEL to your transcription deployment name."
        )
    if not audio:
        raise RuntimeError("Recorded audio was empty.")

    started = time.perf_counter()
    audio_file = BytesIO(audio)
    audio_file.name = filename or "recording.webm"
    uploaded_filename = filename or "recording.webm"
    request = {
        "model": transcription_model,
        "file": {
            "filename": uploaded_filename,
            "content_type": content_type,
            "bytes": len(audio),
        },
    }

    with create_audio_client(settings) as openai_client:
        response = openai_client.audio.transcriptions.create(
            model=transcription_model,
            file=audio_file,
        )

    text = getattr(response, "text", "") or ""
    return {
        "model": transcription_model,
        "text": text,
        "duration_ms": round((time.perf_counter() - started) * 1000),
        "foundry_request": {
            "api_surface": "audio_transcriptions",
            "method": "POST",
            "path": "/audio/transcriptions",
            "payload": request,
        },
        "foundry_response": {
            "api_surface": "audio_transcriptions",
            "payload": {"text_characters": len(text)},
            "extracted": {"text": "[redacted]"},
        },
    }


def transcribe_speech_audio(
    *,
    audio: bytes,
    language: str = "en-US",
    model: str | None = None,
) -> dict[str, Any]:
    settings = load_settings()
    if not settings.is_speech_transcription_configured:
        raise RuntimeError(
            "Azure Speech transcription is not configured. Set AZURE_SPEECH_ENDPOINT."
        )
    if not audio:
        raise RuntimeError("Recorded audio was empty.")

    import azure.cognitiveservices.speech as speechsdk

    started = time.perf_counter()
    if settings.speech_key:
        speech_config = speechsdk.SpeechConfig(
            subscription=settings.speech_key,
            endpoint=settings.speech_endpoint,
        )
    else:
        speech_config = speechsdk.SpeechConfig(
            token_credential=get_azure_credential(),
            endpoint=settings.speech_endpoint,
        )
    speech_config.speech_recognition_language = language
    segments: list[str] = []
    done = threading.Event()
    error: list[str] = []

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as audio_file:
        audio_file.write(audio)
        audio_path = audio_file.name

    try:
        audio_config = speechsdk.audio.AudioConfig(filename=audio_path)
        recognizer = speechsdk.SpeechRecognizer(
            speech_config=speech_config,
            audio_config=audio_config,
        )

        def recognized(evt: Any) -> None:
            if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech and evt.result.text:
                segments.append(evt.result.text.strip())

        def canceled(evt: Any) -> None:
            if evt.reason == speechsdk.CancellationReason.Error:
                error.append(evt.error_details or "Azure Speech recognition was canceled.")
            done.set()

        recognizer.recognized.connect(recognized)
        recognizer.session_stopped.connect(lambda _evt: done.set())
        recognizer.canceled.connect(canceled)
        recognizer.start_continuous_recognition()
        if not done.wait(timeout=300):
            raise RuntimeError("Azure Speech transcription timed out.")
        recognizer.stop_continuous_recognition()
    finally:
        try:
            os.unlink(audio_path)
        except OSError:
            pass

    if error:
        raise RuntimeError(error[0])

    text = " ".join(segment for segment in segments if segment).strip()
    return {
        "model": (model or settings.speech_transcription_model).strip(),
        "text": text,
        "language": language,
        "duration_ms": round((time.perf_counter() - started) * 1000),
        "segments": segments,
    }


def synthesize_speech(
    *,
    text: str,
    model: str | None = None,
    voice: str | None = None,
) -> dict[str, Any]:
    settings = load_settings()
    if not settings.is_traditional_voice_configured:
        raise RuntimeError(
            "Foundry STT/TTS is not configured. Set FOUNDRY_PROJECT_ENDPOINT and audio "
            "model deployments."
        )

    speech_model = (model or settings.tts_model).strip()
    speech_voice = (voice or settings.tts_voice).strip() or "alloy"
    if not speech_model:
        raise RuntimeError("Set FOUNDRY_TTS_MODEL to your text-to-speech deployment name.")
    if not text.strip():
        raise RuntimeError("Cannot synthesize an empty response.")

    started = time.perf_counter()
    with create_audio_client(settings) as openai_client:
        if "gpt-audio" in speech_model.lower():
            request = {
                "model": speech_model,
                "modalities": ["text", "audio"],
                "audio": {"voice": speech_voice, "format": "mp3"},
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are a text-to-speech engine. Read the user's text aloud "
                            "verbatim. Do not answer it, paraphrase it, or add any words."
                        ),
                    },
                    {"role": "user", "content": text},
                ],
            }
            response = openai_client.chat.completions.create(**request)
            response_audio = response.choices[0].message.audio
            if response_audio is None or not response_audio.data:
                raise RuntimeError("Audio completion response did not include audio bytes.")
            audio = base64.b64decode(response_audio.data)
            spoken_transcript = getattr(response_audio, "transcript", None)
            api_surface = "audio_chat_completions"
            path = "/chat/completions"
        else:
            request = {
                "model": speech_model,
                "voice": speech_voice,
                "input": text,
                "response_format": "mp3",
            }
            response = openai_client.audio.speech.create(**request)
            if hasattr(response, "read"):
                audio = response.read()
            elif isinstance(response, bytes):
                audio = response
            elif hasattr(response, "content"):
                audio = response.content
            else:
                raise RuntimeError("Text-to-speech response did not include audio bytes.")
            api_surface = "audio_speech"
            path = "/audio/speech"
            spoken_transcript = None

    return {
        "model": speech_model,
        "voice": speech_voice,
        "audio": audio,
        "audio_mime_type": "audio/mpeg",
        "spoken_transcript": spoken_transcript,
        "duration_ms": round((time.perf_counter() - started) * 1000),
        "foundry_request": {
            "api_surface": api_surface,
            "method": "POST",
            "path": path,
            "payload": {
                "model": speech_model,
                "voice": speech_voice,
                "input_characters": len(text),
            },
        },
        "foundry_response": {
            "api_surface": api_surface,
            "payload": {
                "audio_mime_type": "audio/mpeg",
                "bytes": len(audio),
            },
        },
    }
