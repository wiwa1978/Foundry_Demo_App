import base64
import html
import json
import os
import tempfile
import threading
import time
import uuid
from io import BytesIO
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse

from app.infrastructure.azure.credentials import get_azure_credential
from app.infrastructure.azure.foundry.clients import create_audio_client
from app.infrastructure.azure.foundry.http import build_checked_request, open_checked_url
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


def assess_pronunciation(
    *,
    audio: bytes,
    reference_text: str,
    language: str = "en-US",
) -> dict[str, Any]:
    settings = load_settings()
    if not settings.is_speech_transcription_configured:
        raise RuntimeError(
            "Azure Speech pronunciation assessment is not configured. "
            "Set AZURE_SPEECH_ENDPOINT."
        )
    if not audio:
        raise RuntimeError("Recorded audio was empty.")
    if not reference_text.strip():
        raise RuntimeError("Pronunciation assessment requires recognized speech.")

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
    speech_config.speech_recognition_language = language
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as audio_file:
        audio_file.write(audio)
        audio_path = audio_file.name

    try:
        audio_config = speechsdk.audio.AudioConfig(filename=audio_path)
        recognizer = speechsdk.SpeechRecognizer(
            speech_config=speech_config,
            audio_config=audio_config,
        )
        assessment_config = speechsdk.PronunciationAssessmentConfig(
            reference_text=reference_text.strip(),
            grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
            granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
            enable_miscue=True,
        )
        assessment_config.enable_prosody_assessment = True
        assessment_config.apply_to(recognizer)
        result = recognizer.recognize_once_async().get()
    finally:
        try:
            os.unlink(audio_path)
        except OSError:
            pass

    if result.reason != speechsdk.ResultReason.RecognizedSpeech:
        details = getattr(result, "error_details", None) or "Pronunciation assessment failed."
        raise RuntimeError(details)
    scores = result.pronunciation_assessment_result
    return {
        "accuracy_score": getattr(scores, "accuracy_score", None),
        "fluency_score": getattr(scores, "fluency_score", None),
        "completeness_score": getattr(scores, "completeness_score", None),
        "pronunciation_score": getattr(scores, "pronunciation_score", None),
        "prosody_score": getattr(scores, "prosody_score", None),
        "language": language,
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


def _speech_resource_origin(endpoint: str) -> str:
    normalized = endpoint.strip().rstrip("/")
    parsed = urlparse(normalized)
    if parsed.scheme.lower() != "https" or not parsed.netloc:
        raise RuntimeError(
            "Azure Speech endpoint must be an absolute HTTPS URL, such as "
            "https://<resource>.cognitiveservices.azure.com."
        )
    return f"https://{parsed.netloc}"


def _speech_avatar_token(settings: Any, origin: str) -> str:
    if settings.speech_key:
        request = build_checked_request(
            f"{origin}/sts/v1.0/issueToken",
            headers={"Ocp-Apim-Subscription-Key": settings.speech_key},
            method="POST",
        )
        try:
            with open_checked_url(request, timeout=30) as response:
                token = response.read().decode("utf-8").strip()
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"Azure Speech token request failed with {exc.code}: {detail}"
            ) from exc
        except URLError as exc:
            raise RuntimeError(
                f"Azure Speech token request failed: {exc.reason}"
            ) from exc
    else:
        token = get_azure_credential().get_token(
            "https://cognitiveservices.azure.com/.default"
        ).token

    if not token:
        raise RuntimeError("Azure Speech did not return an authorization token.")
    return token


def _speech_avatar_ice_servers(settings: Any, origin: str, token: str) -> list[dict[str, Any]]:
    headers = (
        {"Ocp-Apim-Subscription-Key": settings.speech_key}
        if settings.speech_key
        else {"Authorization": f"Bearer {token}"}
    )
    request = build_checked_request(
        f"{origin}/tts/cognitiveservices/avatar/relay/token/v1",
        headers=headers,
    )
    try:
        with open_checked_url(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Azure Speech avatar relay request failed with {exc.code}: {detail}"
        ) from exc
    except URLError as exc:
        raise RuntimeError(
            f"Azure Speech avatar relay request failed: {exc.reason}"
        ) from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("Azure Speech avatar relay returned invalid JSON.") from exc

    urls = payload.get("Urls") or payload.get("urls")
    if isinstance(urls, str):
        urls = [urls]
    username = payload.get("Username") or payload.get("username")
    password = payload.get("Password") or payload.get("password")
    if (
        not isinstance(urls, list)
        or not urls
        or not all(isinstance(url, str) and url for url in urls)
        or not isinstance(username, str)
        or not username
        or not isinstance(password, str)
        or not password
    ):
        raise RuntimeError("Azure Speech avatar relay returned incomplete ICE server data.")

    return [{"urls": urls, "username": username, "credential": password}]


def create_text_to_speech_avatar_session() -> dict[str, Any]:
    settings = load_settings()
    if not settings.speech_endpoint:
        raise RuntimeError(
            "Text to Speech Avatar is not configured. Set AZURE_SPEECH_ENDPOINT."
        )

    origin = _speech_resource_origin(settings.speech_endpoint)
    token = _speech_avatar_token(settings, origin)
    return {
        "authorization_token": token,
        "websocket_endpoint": (
            f"wss://{urlparse(origin).netloc}"
            "/tts/cognitiveservices/websocket/v1?enableTalkingAvatar=true"
        ),
        "ice_servers": _speech_avatar_ice_servers(settings, origin, token),
        "expires_in": 600,
    }


def _speech_auth_headers(settings: Any) -> dict[str, str]:
    if settings.speech_key:
        return {"Ocp-Apim-Subscription-Key": settings.speech_key}
    token = get_azure_credential().get_token(
        "https://cognitiveservices.azure.com/.default"
    ).token
    if not token:
        raise RuntimeError("Azure Speech did not return an authorization token.")
    return {"Authorization": f"Bearer {token}"}


def _batch_avatar_url(origin: str, job_id: str) -> str:
    return (
        f"{origin}/avatar/batchsyntheses/{quote(job_id, safe='')}"
        "?api-version=2024-08-01"
    )


def _normalize_batch_avatar_job(
    payload: dict[str, Any], fallback_id: str
) -> dict[str, Any]:
    outputs = payload.get("outputs")
    if not isinstance(outputs, dict):
        outputs = {}
    properties = payload.get("properties")
    if not isinstance(properties, dict):
        properties = {}
    status = str(payload.get("status") or "Unknown")
    error = properties.get("error") or payload.get("error")
    return {
        "id": str(payload.get("id") or fallback_id),
        "status": status,
        "output_url": outputs.get("result")
        if isinstance(outputs.get("result"), str)
        else None,
        "summary_url": outputs.get("summary")
        if isinstance(outputs.get("summary"), str)
        else None,
        "error": str(error) if error else None,
    }


def submit_batch_avatar_synthesis(
    *,
    text: str,
    avatar_type: str = "video",
    character: str = "lisa",
    style: str = "graceful-sitting",
    voice: str = "en-US-Ava:DragonHDLatestNeural",
    custom_voice_endpoint_id: str = "",
    customized: bool = False,
    use_built_in_voice: bool = False,
    background_color: str = "#FFFFFFFF",
    background_image: str = "",
) -> dict[str, Any]:
    settings = load_settings()
    if not settings.speech_endpoint:
        raise RuntimeError(
            "Text to Speech Avatar is not configured. Set AZURE_SPEECH_ENDPOINT."
        )
    cleaned_text = text.strip()
    if not cleaned_text:
        raise RuntimeError("Cannot synthesize an empty avatar script.")
    if len(cleaned_text.encode("utf-8")) > 500 * 1024:
        raise RuntimeError("The avatar script cannot exceed 500 KB.")
    if avatar_type not in {"video", "photo"}:
        raise RuntimeError("Avatar type must be video or photo.")
    if background_image:
        parsed_background = urlparse(background_image)
        if parsed_background.scheme.lower() != "https" or not parsed_background.netloc:
            raise RuntimeError("Avatar background image must be an HTTPS URL.")

    selected_voice = voice.strip()
    if not selected_voice:
        raise RuntimeError("A Speech voice is required.")
    avatar_config: dict[str, Any] = {
        "videoFormat": "mp4",
        "videoCodec": "h264",
        "subtitleType": "soft_embedded",
        "customized": customized,
        "useBuiltInVoice": customized and use_built_in_voice,
    }
    if avatar_type == "photo":
        avatar_config.update(
            {
                "photoAvatarBaseModel": "vasa-1",
                "talkingAvatarCharacter": character.strip() or "anika",
            }
        )
    else:
        avatar_config.update(
            {
                "talkingAvatarCharacter": character.strip() or "lisa",
                "talkingAvatarStyle": style.strip() or "graceful-sitting",
            }
        )
    if background_image.strip():
        avatar_config["backgroundImage"] = background_image.strip()
    else:
        avatar_config["backgroundColor"] = background_color.strip() or "#FFFFFFFF"

    payload: dict[str, Any] = {
        "synthesisConfig": {"voice": selected_voice},
        "inputKind": "PlainText",
        "inputs": [{"content": cleaned_text}],
        "avatarConfig": avatar_config,
    }
    custom_id = custom_voice_endpoint_id.strip()
    if custom_id:
        payload["customVoices"] = {selected_voice: custom_id}

    job_id = f"avatar-{uuid.uuid4().hex}"
    request = build_checked_request(
        _batch_avatar_url(_speech_resource_origin(settings.speech_endpoint), job_id),
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", **_speech_auth_headers(settings)},
        method="PUT",
    )
    try:
        with open_checked_url(request, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Azure Speech batch avatar submission failed with {exc.code}: {detail}"
        ) from exc
    except URLError as exc:
        raise RuntimeError(
            f"Azure Speech batch avatar submission failed: {exc.reason}"
        ) from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("Azure Speech batch avatar returned invalid JSON.") from exc
    if not isinstance(result, dict):
        raise RuntimeError("Azure Speech batch avatar returned an invalid job.")
    return _normalize_batch_avatar_job(result, job_id)


def get_batch_avatar_synthesis(job_id: str) -> dict[str, Any]:
    settings = load_settings()
    if not settings.speech_endpoint:
        raise RuntimeError(
            "Text to Speech Avatar is not configured. Set AZURE_SPEECH_ENDPOINT."
        )
    if (
        len(job_id) < 3
        or len(job_id) > 64
        or not all(character.isalnum() or character in "-_" for character in job_id)
    ):
        raise RuntimeError("Invalid avatar synthesis job ID.")
    request = build_checked_request(
        _batch_avatar_url(_speech_resource_origin(settings.speech_endpoint), job_id),
        headers=_speech_auth_headers(settings),
    )
    try:
        with open_checked_url(request, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Azure Speech batch avatar status request failed with {exc.code}: {detail}"
        ) from exc
    except URLError as exc:
        raise RuntimeError(
            f"Azure Speech batch avatar status request failed: {exc.reason}"
        ) from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("Azure Speech batch avatar returned invalid JSON.") from exc
    if not isinstance(result, dict):
        raise RuntimeError("Azure Speech batch avatar returned an invalid job.")
    return _normalize_batch_avatar_job(result, job_id)


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
