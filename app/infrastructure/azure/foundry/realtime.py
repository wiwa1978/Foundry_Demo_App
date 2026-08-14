import json
from typing import Any, TypedDict, cast
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse

from app.infrastructure.azure.credentials import get_azure_credential
from app.infrastructure.azure.foundry.http import build_checked_request, open_checked_url
from app.infrastructure.azure.foundry.settings import load_settings


class VoiceLiveConnectionInfo(TypedDict):
    url: str
    token: str
    model: str
    voice: str


class RealtimeTranscriptionConnectionInfo(TypedDict):
    url: str
    token: str
    model: str
    session_update: dict[str, Any]


class RealtimeTranslationConnectionInfo(TypedDict):
    url: str
    token: str
    model: str
    transcription_model: str | None
    session_update: dict[str, Any]


def _normalize_realtime_endpoint(endpoint_value: str) -> str:
    endpoint = endpoint_value.strip().rstrip("/")
    if not endpoint:
        raise RuntimeError(
            "Foundry Realtime is not configured. Set FOUNDRY_REALTIME_ENDPOINT or "
            "FOUNDRY_PROJECT_ENDPOINT to your Foundry endpoint."
        )
    if "://" not in endpoint and "/" not in endpoint:
        return f"https://{endpoint}.services.ai.azure.com/openai/v1"

    parsed = urlparse(endpoint)
    if parsed.scheme.lower() != "https" or not parsed.netloc:
        raise RuntimeError(
            "FOUNDRY_REALTIME_ENDPOINT must be a Foundry OpenAI endpoint like "
            "https://<resource-name>.services.ai.azure.com/openai/v1."
        )

    path = parsed.path.rstrip("/")
    if path.endswith("/openai/v1"):
        base_path = path
    elif "/api/projects/" in path:
        base_path = "/openai/v1"
    elif path.endswith("/openai"):
        base_path = f"{path}/v1"
    elif not path:
        base_path = "/openai/v1"
    else:
        base_path = f"{path}/openai/v1"
    return f"https://{parsed.netloc}{base_path}"


def create_realtime_client_secret(
    *,
    model: str | None = None,
    instructions: str = "You are a helpful voice assistant. Keep responses concise.",
    voice: str = "alloy",
) -> dict[str, Any]:
    settings = load_settings()
    if not settings.is_realtime_configured:
        raise RuntimeError(
            "Foundry Realtime is not configured. Set FOUNDRY_REALTIME_ENDPOINT or "
            "FOUNDRY_PROJECT_ENDPOINT to your Foundry endpoint."
        )

    realtime_model = (model or settings.realtime_model).strip()
    if not realtime_model:
        raise RuntimeError("Set FOUNDRY_REALTIME_MODEL to your realtime deployment name.")

    endpoint = _normalize_realtime_endpoint(settings.realtime_endpoint or "")
    token_url = f"{endpoint}/realtime/client_secrets"
    output_voice = voice.strip() or "alloy"
    payload = {
        "session": {
            "type": "realtime",
            "model": realtime_model,
            "instructions": instructions.strip(),
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
                "output": {"voice": output_voice},
            },
        },
    }
    bearer_token = get_azure_credential().get_token("https://ai.azure.com/.default").token
    request = build_checked_request(
        token_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {bearer_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with open_checked_url(request, timeout=30) as response:
            data = cast(dict[str, Any], json.loads(response.read().decode("utf-8")))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Realtime client secret request failed with {exc.code}: {detail}"
        ) from exc
    except URLError as exc:
        raise RuntimeError(f"Realtime client secret request failed: {exc.reason}") from exc

    nested_secret = data.get("client_secret", {})
    if not isinstance(nested_secret, dict):
        nested_secret = {}
    client_secret = data.get("value") or nested_secret.get("value")
    if not isinstance(client_secret, str) or not client_secret:
        raise RuntimeError("Realtime client secret response did not include a token.")
    expires_at = data.get("expires_at") or nested_secret.get("expires_at")
    return {
        "token": client_secret,
        "webrtc_url": f"{endpoint}/realtime/calls?webrtcfilter=on",
        "model": realtime_model,
        "voice": output_voice,
        "expires_at": expires_at,
    }


SUPPORTED_TRANSCRIPTION_DELAYS = {"minimal", "low", "medium", "high", "xhigh"}
SUPPORTED_TRANSCRIPTION_TURN_DETECTION = {"none", "server_vad", "semantic_vad"}


def _realtime_transcription_session(
    model: str,
    *,
    language: str | None = None,
    delay: str | None = None,
    turn_detection: str = "server_vad",
) -> dict[str, Any]:
    normalized_language = language.strip().lower() if language else None
    if normalized_language and (len(normalized_language) != 2 or not normalized_language.isalpha()):
        raise ValueError("Realtime transcription language must be an ISO-639-1 code.")
    normalized_delay = delay.strip().lower() if delay else None
    if normalized_delay and normalized_delay not in SUPPORTED_TRANSCRIPTION_DELAYS:
        raise ValueError("Unsupported realtime transcription delay.")
    normalized_turn_detection = turn_detection.strip().lower()
    if normalized_turn_detection not in SUPPORTED_TRANSCRIPTION_TURN_DETECTION:
        raise ValueError("Unsupported realtime transcription turn detection mode.")

    transcription: dict[str, Any] = {"model": model}
    if normalized_language:
        transcription["language"] = normalized_language
    if normalized_delay:
        transcription["delay"] = normalized_delay
    turn_detection_config: dict[str, Any] | None = None
    if normalized_turn_detection == "server_vad":
        turn_detection_config = {
            "type": "server_vad",
            "threshold": 0.5,
            "prefix_padding_ms": 300,
            "silence_duration_ms": 900,
        }
    elif normalized_turn_detection == "semantic_vad":
        turn_detection_config = {"type": "semantic_vad", "eagerness": "low"}

    return {
        "type": "transcription",
        "audio": {
            "input": {
                "format": {"type": "audio/pcm", "rate": 24000},
                "transcription": transcription,
                "turn_detection": turn_detection_config,
            }
        },
    }


def create_realtime_transcription_client_secret(
    *,
    model: str | None = None,
    language: str | None = None,
    delay: str | None = None,
    turn_detection: str = "server_vad",
) -> dict[str, Any]:
    settings = load_settings()
    endpoint = _normalize_realtime_endpoint(settings.realtime_endpoint or "")
    selected_model = (model or settings.realtime_transcription_model).strip()
    if not selected_model:
        raise RuntimeError(
            "Realtime transcription requires a deployment name from /api/models or "
            "FOUNDRY_REALTIME_TRANSCRIPTION_MODEL."
        )
    payload = {
        "session": _realtime_transcription_session(
            selected_model,
            language=language,
            delay=delay,
            turn_detection=turn_detection,
        )
    }
    bearer_token = get_azure_credential().get_token("https://ai.azure.com/.default").token
    request = build_checked_request(
        f"{endpoint}/realtime/client_secrets",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {bearer_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with open_checked_url(request, timeout=30) as response:
            data = cast(dict[str, Any], json.loads(response.read().decode("utf-8")))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Realtime transcription client secret request failed with {exc.code}: {detail}"
        ) from exc
    except URLError as exc:
        raise RuntimeError(
            f"Realtime transcription client secret request failed: {exc.reason}"
        ) from exc

    nested_secret = data.get("client_secret", {})
    if not isinstance(nested_secret, dict):
        nested_secret = {}
    client_secret = data.get("value") or nested_secret.get("value")
    if not isinstance(client_secret, str) or not client_secret:
        raise RuntimeError("Realtime transcription response did not include a token.")
    return {
        "token": client_secret,
        # Do not enable webrtcfilter: transcription deltas must reach the browser.
        "webrtc_url": f"{endpoint}/realtime/calls",
        "model": selected_model,
        "expires_at": data.get("expires_at") or nested_secret.get("expires_at"),
    }


def create_realtime_transcription_connection_info(
    *,
    model: str | None = None,
    language: str | None = None,
    delay: str | None = None,
    turn_detection: str = "none",
) -> RealtimeTranscriptionConnectionInfo:
    settings = load_settings()
    endpoint = _normalize_realtime_endpoint(settings.realtime_endpoint or "")
    selected_model = (model or settings.realtime_transcription_model).strip()
    if not selected_model:
        raise RuntimeError(
            "Realtime transcription requires a deployment name from /api/models or "
            "FOUNDRY_REALTIME_TRANSCRIPTION_MODEL."
        )
    token = get_azure_credential().get_token("https://ai.azure.com/.default").token
    return {
        "url": endpoint.replace("https://", "wss://", 1) + "/realtime?intent=transcription",
        "token": token,
        "model": selected_model,
        "session_update": {
            "type": "session.update",
            "session": _realtime_transcription_session(
                selected_model,
                language=language,
                delay=delay,
                turn_detection=turn_detection,
            ),
        },
    }


def _realtime_translation_audio_session(
    *,
    target_language: str,
    source_language: str | None = None,
    transcription_model: str | None = None,
) -> dict[str, Any]:
    language = target_language.strip().lower()
    if len(language) != 2 or not language.isalpha():
        raise ValueError("Realtime translation target must be an ISO-639-1 code.")
    source = source_language.strip().lower() if source_language else None
    if source and (len(source) != 2 or not source.isalpha()):
        raise ValueError("Realtime translation source must be an ISO-639-1 code.")
    audio_session: dict[str, Any] = {"output": {"language": language}}
    if transcription_model:
        transcription: dict[str, Any] = {"model": transcription_model}
        if source:
            transcription["language"] = source
        audio_session["input"] = {"transcription": transcription}
    return audio_session


def create_realtime_translation_client_secret(
    *,
    model: str | None = None,
    source_language: str | None = None,
    target_language: str = "fr",
    transcription_model: str | None = None,
) -> dict[str, Any]:
    settings = load_settings()
    if not settings.is_realtime_translation_configured:
        raise RuntimeError(
            "Realtime translation is not configured. Set FOUNDRY_REALTIME_ENDPOINT "
            "and FOUNDRY_REALTIME_TRANSLATION_MODEL."
        )
    endpoint = _normalize_realtime_endpoint(settings.realtime_endpoint or "")
    selected_model = (model or settings.realtime_translation_model).strip()
    selected_transcription_model = (
        transcription_model or settings.realtime_transcription_model
    ).strip() or None
    audio_session = _realtime_translation_audio_session(
        target_language=target_language,
        source_language=source_language,
        transcription_model=selected_transcription_model,
    )
    payload = {
        "session": {
            "type": "realtime",
            "model": selected_model,
            "audio": audio_session,
        }
    }
    bearer_token = get_azure_credential().get_token("https://ai.azure.com/.default").token
    request = build_checked_request(
        f"{endpoint}/realtime/client_secrets",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {bearer_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with open_checked_url(request, timeout=30) as response:
            data = cast(dict[str, Any], json.loads(response.read().decode("utf-8")))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Realtime translation client secret request failed with {exc.code}: {detail}"
        ) from exc
    except URLError as exc:
        raise RuntimeError(
            f"Realtime translation client secret request failed: {exc.reason}"
        ) from exc

    nested_secret = data.get("client_secret", {})
    if not isinstance(nested_secret, dict):
        nested_secret = {}
    client_secret = data.get("value") or nested_secret.get("value")
    if not isinstance(client_secret, str) or not client_secret:
        raise RuntimeError("Realtime translation response did not include a token.")
    return {
        "token": client_secret,
        "webrtc_url": f"{endpoint}/realtime/calls",
        "model": selected_model,
        "expires_at": data.get("expires_at") or nested_secret.get("expires_at"),
    }


def create_realtime_translation_connection_info(
    *,
    target_language: str,
    source_language: str | None = None,
    model: str | None = None,
    transcription_model: str | None = None,
) -> RealtimeTranslationConnectionInfo:
    settings = load_settings()
    if not settings.is_realtime_translation_configured:
        raise RuntimeError(
            "Realtime translation is not configured. Set FOUNDRY_REALTIME_ENDPOINT "
            "and FOUNDRY_REALTIME_TRANSLATION_MODEL. Set "
            "FOUNDRY_REALTIME_TRANSCRIPTION_MODEL only when source captions are needed."
        )
    language = target_language.strip().lower()
    if len(language) != 2 or not language.isalpha():
        raise ValueError("Realtime translation target must be an ISO-639-1 code.")
    source = source_language.strip().lower() if source_language else None
    if source and (len(source) != 2 or not source.isalpha()):
        raise ValueError("Realtime translation source must be an ISO-639-1 code.")

    endpoint = _normalize_realtime_endpoint(settings.realtime_endpoint or "")
    selected_model = (model or settings.realtime_translation_model).strip()
    selected_transcription_model = (
        transcription_model or settings.realtime_transcription_model
    ).strip() or None
    token = get_azure_credential().get_token("https://ai.azure.com/.default").token
    audio_session: dict[str, Any] = {"output": {"language": language}}
    if selected_transcription_model:
        transcription = {"model": selected_transcription_model}
        if source:
            transcription["language"] = source
        audio_session["input"] = {"transcription": transcription}

    return {
        "url": endpoint.replace("https://", "wss://", 1)
        + f"/realtime/translations?model={quote(selected_model, safe='')}",
        "token": token,
        "model": selected_model,
        "transcription_model": selected_transcription_model,
        "session_update": {
            "type": "session.update",
            "session": {"audio": audio_session},
        },
    }


def create_voice_live_connection_info() -> VoiceLiveConnectionInfo:
    settings = load_settings()
    if not settings.is_voice_live_configured:
        raise RuntimeError(
            "Voice Live is not configured. Set AZURE_VOICELIVE_ENDPOINT to the "
            "Foundry or Azure Speech resource endpoint."
        )

    endpoint = (settings.voice_live_endpoint or "").rstrip("/")
    parsed = urlparse(endpoint)
    if parsed.scheme.lower() != "https" or not parsed.netloc:
        raise RuntimeError("AZURE_VOICELIVE_ENDPOINT must be an absolute HTTPS endpoint.")
    websocket_url = (
        f"wss://{parsed.netloc}/voice-live/realtime/calls"
        f"?api-version=2026-04-10&model={settings.voice_live_model}"
    )
    token = get_azure_credential().get_token("https://ai.azure.com/.default").token
    return {
        "url": websocket_url,
        "token": token,
        "model": settings.voice_live_model,
        "voice": settings.voice_live_voice,
    }
