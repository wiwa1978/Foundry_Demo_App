import base64
import html
import os
import tempfile
import threading
import time
from io import BytesIO
from typing import Any

from app.infrastructure.azure.credentials import get_azure_credential
from app.infrastructure.azure.foundry.clients import create_audio_client
from app.infrastructure.azure.foundry.settings import load_settings


def transcribe_audio(
    *,
    audio: bytes,
    filename: str,
    content_type: str | None = None,
    model: str | None = None,
) -> dict[str, Any]:
    settings = load_settings()
    if not settings.endpoint:
        raise RuntimeError("Foundry transcription is not configured. Set FOUNDRY_PROJECT_ENDPOINT.")

    transcription_model = (model or settings.transcription_model).strip()
    if not transcription_model:
        raise RuntimeError("Set FOUNDRY_TRANSCRIPTION_MODEL to your transcription deployment name.")
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


def synthesize_azure_speech(
    *,
    text: str,
    voice: str = "en-US-Ava:DragonHDLatestNeural",
    language: str = "en-US",
    emotion: str = "neutral",
    pitch: str = "0%",
    rate: str = "0%",
    volume: str = "0%",
) -> dict[str, Any]:
    settings = load_settings()
    if not settings.is_speech_transcription_configured:
        raise RuntimeError(
            "Azure Speech is not configured. Set AZURE_SPEECH_ENDPOINT."
        )
    if not text.strip():
        raise RuntimeError("Cannot synthesize empty text.")

    import azure.cognitiveservices.speech as speechsdk

    speech_config = (
        speechsdk.SpeechConfig(
            subscription=settings.speech_key,
            endpoint=settings.speech_endpoint,
        )
        if settings.speech_key
        else speechsdk.SpeechConfig(
            token_credential=get_azure_credential(),
            endpoint=settings.speech_endpoint,
        )
    )
    speech_config.set_speech_synthesis_output_format(
        speechsdk.SpeechSynthesisOutputFormat.Audio16Khz128KBitRateMonoMp3
    )
    selected_voice = voice.strip() or "en-US-Ava:DragonHDLatestNeural"
    escaped_text = html.escape(text.strip())
    escaped_voice = html.escape(selected_voice, quote=True)
    escaped_language = html.escape(language.strip() or "en-US", quote=True)
    escaped_emotion = html.escape(emotion.strip() or "neutral", quote=True)
    prosody = (
        f'<prosody rate="{html.escape(rate)}" pitch="{html.escape(pitch)}" '
        f'volume="{html.escape(volume)}">{escaped_text}</prosody>'
    )
    if escaped_emotion and escaped_emotion != "neutral":
        prosody = f'<mstts:express-as style="{escaped_emotion}">{prosody}</mstts:express-as>'

    ssml = (
        f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
        f'xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="{escaped_language}">'
        f'<voice name="{escaped_voice}">'
        f"{prosody}"
        "</voice></speak>"
    )

    started = time.perf_counter()
    result = speechsdk.SpeechSynthesizer(
        speech_config=speech_config,
        audio_config=None,
    ).speak_ssml_async(ssml).get()
    if result.reason != speechsdk.ResultReason.SynthesizingAudioCompleted:
        details = getattr(result, "error_details", None) or "Azure Speech synthesis failed."
        raise RuntimeError(details)

    return {
        "model": "Dragon HD Latest",
        "voice": selected_voice,
        "language": language,
        "emotion": emotion,
        "audio": bytes(result.audio_data),
        "audio_mime_type": "audio/mpeg",
        "duration_ms": round((time.perf_counter() - started) * 1000),
        "speech_request": {
            "service": "Azure Speech",
            "voice": selected_voice,
            "language": language,
            "emotion": emotion,
            "pitch": pitch,
            "rate": rate,
            "volume": volume,
            "text_characters": len(text),
        },
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
