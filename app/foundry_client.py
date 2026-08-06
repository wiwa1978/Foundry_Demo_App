import os
import time
import base64
from io import BytesIO
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
import json
import tempfile
import threading
import uuid
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from azure.identity import get_bearer_token_provider
from openai import AzureOpenAI, OpenAI

from app.azure_credential import get_azure_credential
from app.config import env_csv, first_env
from app.model_settings import list_models

SAMPLING_UNSUPPORTED_MODEL_PREFIXES = ("gpt-5", "gpt5", "o1", "o3", "o4")


@dataclass(frozen=True)
class FoundrySettings:
    endpoint: str | None
    models: list[str]
    realtime_endpoint: str | None
    realtime_model: str
    embedding_model: str
    transcription_model: str
    tts_model: str
    tts_voice: str
    speech_endpoint: str | None
    speech_key: str | None
    speech_transcription_model: str
    voice_live_endpoint: str | None = None
    voice_live_model: str = "gpt-realtime"
    voice_live_voice: str = "en-US-Ava:DragonHDLatestNeural"

    @property
    def is_configured(self) -> bool:
        return bool(self.endpoint)

    @property
    def is_realtime_configured(self) -> bool:
        return bool(self.realtime_endpoint and self.realtime_model)

    @property
    def is_traditional_voice_configured(self) -> bool:
        return bool(self.endpoint and self.transcription_model and self.tts_model)

    @property
    def is_speech_transcription_configured(self) -> bool:
        return bool(self.speech_endpoint)

    @property
    def is_voice_live_configured(self) -> bool:
        return bool(self.voice_live_endpoint and self.voice_live_model)

    @property
    def is_live_interpreter_configured(self) -> bool:
        return bool(self.speech_endpoint)

    @property
    def auth_mode(self) -> str:
        return "entra_id"


def load_settings() -> FoundrySettings:
    seed_models = env_csv("FOUNDRY_MODELS")
    models = list_models(seed_models)
    realtime_model = (
        first_env("FOUNDRY_REALTIME_MODEL")
        or next((model for model in models if "realtime" in model.lower()), None)
        or "gpt-realtime-2.1"
    )

    return FoundrySettings(
        endpoint=first_env(
            "FOUNDRY_PROJECT_ENDPOINT",
            "AZURE_AI_PROJECT_ENDPOINT",
            "AZURE_AIPROJECT_ENDPOINT",
            "FOUNDRY_ENDPOINT",
            "FOUNDRY_OPENAI_ENDPOINT",
            "AZURE_OPENAI_ENDPOINT",
        ),
        models=models,
        realtime_endpoint=first_env(
            "FOUNDRY_REALTIME_ENDPOINT",
            "AZURE_OPENAI_ENDPOINT",
            "FOUNDRY_OPENAI_ENDPOINT",
            "FOUNDRY_PROJECT_ENDPOINT",
            "AZURE_AI_PROJECT_ENDPOINT",
            "AZURE_AIPROJECT_ENDPOINT",
            "FOUNDRY_ENDPOINT",
        ),
        realtime_model=realtime_model,
        embedding_model=first_env(
            "FOUNDRY_EMBEDDING_MODEL", default="text-embedding-3-small"
        ) or "text-embedding-3-small",
        transcription_model=first_env(
            "FOUNDRY_TRANSCRIPTION_MODEL",
            "AZURE_OPENAI_TRANSCRIPTION_MODEL",
            default="gpt-4o-mini-transcribe",
        ) or "gpt-4o-mini-transcribe",
        tts_model=first_env(
            "FOUNDRY_TTS_MODEL",
            "AZURE_OPENAI_TTS_MODEL",
            default="gpt-4o-mini-tts",
        ) or "gpt-4o-mini-tts",
        tts_voice=first_env("FOUNDRY_TTS_VOICE", default="alloy") or "alloy",
        speech_endpoint=first_env("AZURE_SPEECH_ENDPOINT"),
        speech_key=first_env("AZURE_SPEECH_KEY"),
        speech_transcription_model=first_env(
            "AZURE_SPEECH_TRANSCRIPTION_MODEL", default="MAI-Transcribe-1.5"
        ) or "MAI-Transcribe-1.5",
        voice_live_endpoint=first_env("AZURE_VOICELIVE_ENDPOINT", "AZURE_SPEECH_ENDPOINT"),
        voice_live_model=first_env("AZURE_VOICELIVE_MODEL", default="gpt-realtime")
        or "gpt-realtime",
        voice_live_voice=first_env(
            "AZURE_VOICELIVE_VOICE", default="en-US-Ava:DragonHDLatestNeural"
        ) or "en-US-Ava:DragonHDLatestNeural",
    )


def _format_response_input(
    prompt: str, history: list[dict[str, str]] | None
) -> list[dict[str, str]]:
    items = [
        {
            "type": "message",
            "role": message["role"],
            "content": message["content"],
        }
        for message in history or []
        if message.get("role") in {"user", "assistant"} and message.get("content")
    ]
    items.append({"type": "message", "role": "user", "content": prompt.strip()})
    return items


def _format_chat_messages(
    prompt: str, system_prompt: str, history: list[dict[str, str]] | None
) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    if system_prompt.strip():
        messages.append({"role": "system", "content": system_prompt.strip()})
    messages.extend(
        {
            "role": message["role"],
            "content": message["content"],
        }
        for message in history or []
        if message.get("role") in {"user", "assistant"} and message.get("content")
    )
    messages.append({"role": "user", "content": prompt.strip()})
    return messages


def _usage_to_dict(usage: Any) -> dict[str, int | None]:
    input_tokens = getattr(usage, "input_tokens", None) or getattr(usage, "prompt_tokens", None)
    output_tokens = getattr(usage, "output_tokens", None) or getattr(
        usage, "completion_tokens", None
    )
    total_tokens = getattr(usage, "total_tokens", None)

    return {
        "prompt_tokens": input_tokens,
        "completion_tokens": output_tokens,
        "total_tokens": total_tokens,
    }


def _serialize_openai_payload(value: Any) -> Any:
    if value is None or isinstance(value, str | int | float | bool):
        return value
    if isinstance(value, list | tuple):
        return [_serialize_openai_payload(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _serialize_openai_payload(item) for key, item in value.items()}
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if hasattr(value, "to_dict"):
        return value.to_dict()
    return repr(value)


def _supports_sampling_parameters(model: str) -> bool:
    normalized_model = model.strip().lower().replace("_", "-")
    return not normalized_model.startswith(SAMPLING_UNSUPPORTED_MODEL_PREFIXES)


def _build_response_request(
    *,
    model: str,
    prompt: str,
    system_prompt: str,
    temperature: float,
    top_p: float,
    max_tokens: int,
    repetition_penalty: float,
    reasoning_effort: str | None,
    history: list[dict[str, str]] | None,
) -> dict[str, Any]:
    request: dict[str, Any] = {
        "model": model,
        "input": _format_response_input(prompt, history),
        "max_output_tokens": max_tokens,
    }
    if system_prompt.strip():
        request["instructions"] = system_prompt.strip()
    if reasoning_effort:
        request["reasoning"] = {"effort": reasoning_effort}
    if _supports_sampling_parameters(model):
        request["temperature"] = temperature
        request["top_p"] = top_p
        if repetition_penalty != 1:
            request["extra_body"] = {"frequency_penalty": repetition_penalty - 1}
    return request


def _build_chat_completion_request(
    *,
    model: str,
    prompt: str,
    system_prompt: str,
    temperature: float,
    top_p: float,
    max_tokens: int,
    repetition_penalty: float,
    history: list[dict[str, str]] | None,
) -> dict[str, Any]:
    request: dict[str, Any] = {
        "model": model,
        "messages": _format_chat_messages(prompt, system_prompt, history),
        "max_completion_tokens": max_tokens,
    }
    if _supports_sampling_parameters(model):
        request["temperature"] = temperature
        request["top_p"] = top_p
        if repetition_penalty != 1:
            request["frequency_penalty"] = repetition_penalty - 1
    return request


def build_foundry_request_trace(
    *,
    model: str,
    prompt: str,
    api_surface: str,
    system_prompt: str,
    temperature: float,
    top_p: float,
    max_tokens: int,
    repetition_penalty: float = 1.0,
    reasoning_effort: str | None = None,
    history: list[dict[str, str]] | None = None,
    guardrail_policy_name: str | None = None,
) -> dict[str, Any]:
    if api_surface == "chat_completions":
        request = _build_chat_completion_request(
            model=model,
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
            repetition_penalty=repetition_penalty,
            history=history,
        )
        trace = {
            "api_surface": api_surface,
            "method": "POST",
            "path": "/chat/completions",
            "payload": request,
        }
        if guardrail_policy_name:
            trace["headers"] = {"x-policy-id": guardrail_policy_name}
        return trace
    if api_surface == "responses":
        request = _build_response_request(
            model=model,
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
            repetition_penalty=repetition_penalty,
            reasoning_effort=reasoning_effort,
            history=history,
        )
        trace = {
            "api_surface": api_surface,
            "method": "POST",
            "path": "/responses",
            "payload": request,
        }
        if guardrail_policy_name:
            trace["headers"] = {"x-policy-id": guardrail_policy_name}
        return trace
    raise ValueError("API surface must be 'responses' or 'chat_completions'.")


def build_foundry_response_trace(
    *,
    api_surface: str,
    response: Any,
    content: str,
    usage: Any,
) -> dict[str, Any]:
    payload = _serialize_openai_payload(response)
    return {
        "api_surface": api_surface,
        "payload": payload,
        "extracted": {
            "content": content,
            "usage": _usage_to_dict(usage),
            "guardrail_results": _extract_guardrail_results(payload),
        },
    }


def build_foundry_stream_response_trace(
    *,
    api_surface: str,
    events: list[Any],
    content: str,
    usage: Any,
) -> dict[str, Any]:
    serialized_events = [_serialize_openai_payload(event) for event in events]
    return {
        "api_surface": api_surface,
        "events": serialized_events,
        "extracted": {
            "content": content,
            "usage": _usage_to_dict(usage),
            "guardrail_results": _extract_stream_guardrail_results(serialized_events),
        },
    }


SENSITIVE_TRACE_KEYS = {
    "audio",
    "audio_base64",
    "b64_json",
    "content",
    "delta",
    "input",
    "instructions",
    "messages",
    "prompt",
    "system_prompt",
    "text",
    "token",
}


def redact_foundry_trace(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: "[redacted]" if key.lower() in SENSITIVE_TRACE_KEYS else redact_foundry_trace(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact_foundry_trace(item) for item in value[:100]]
    if isinstance(value, str) and len(value) > 500:
        return f"[redacted {len(value)} characters]"
    return value


def _extract_guardrail_results(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    results = {
        key: payload[key]
        for key in ("content_filters", "prompt_filter_results")
        if payload.get(key) is not None
    }
    choice_results = [
        choice["content_filter_results"]
        for choice in payload.get("choices", [])
        if isinstance(choice, dict) and choice.get("content_filter_results") is not None
    ]
    if choice_results:
        results["content_filter_results"] = choice_results
    return results or None


def _extract_stream_guardrail_results(events: list[Any]) -> dict[str, Any] | None:
    event_results = [
        result
        for event in events
        if (result := _extract_guardrail_results(event)) is not None
    ]
    return {"events": event_results} if event_results else None


def _normalize_endpoint(endpoint_value: str) -> str:
    endpoint = endpoint_value.rstrip("/")
    if endpoint.endswith("/models"):
        raise RuntimeError(
            "FOUNDRY_PROJECT_ENDPOINT must be a Foundry project endpoint like "
            "https://<resource-name>.services.ai.azure.com/api/projects/<project-name>, "
            "not the legacy /models inference endpoint."
        )
    return endpoint


def _openai_base_url(endpoint_value: str) -> str:
    endpoint = _normalize_endpoint(endpoint_value)
    if "://" not in endpoint and "/" not in endpoint:
        return f"https://{endpoint}.services.ai.azure.com/openai/v1"

    parsed = urlparse(endpoint)
    if not parsed.scheme or not parsed.netloc:
        raise RuntimeError(
            "FOUNDRY_PROJECT_ENDPOINT must be a Foundry project endpoint like "
            "https://<resource-name>.services.ai.azure.com/api/projects/<project-name>."
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
    return f"{parsed.scheme}://{parsed.netloc}{base_path}"


def _azure_openai_endpoint(endpoint_value: str) -> str:
    endpoint = _normalize_endpoint(endpoint_value)
    parsed = urlparse(endpoint)
    if not parsed.scheme or not parsed.netloc:
        raise RuntimeError(
            "FOUNDRY_PROJECT_ENDPOINT must be a Foundry project endpoint like "
            "https://<resource-name>.services.ai.azure.com/api/projects/<project-name>."
        )

    hostname = parsed.hostname or ""
    if hostname.endswith(".services.ai.azure.com"):
        hostname = f"{hostname.removesuffix('.services.ai.azure.com')}.openai.azure.com"
    return f"{parsed.scheme}://{hostname}"


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
    if not parsed.scheme or not parsed.netloc:
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
    return f"{parsed.scheme}://{parsed.netloc}{base_path}"


@contextmanager
def _create_openai_client(settings: FoundrySettings) -> Iterator[OpenAI]:
    endpoint = _normalize_endpoint(settings.endpoint or "")
    token_provider = get_bearer_token_provider(
        get_azure_credential(),
        "https://ai.azure.com/.default",
    )
    with OpenAI(
        base_url=_openai_base_url(endpoint),
        api_key=token_provider,
    ) as openai_client:
        yield openai_client


@contextmanager
def _create_audio_client(settings: FoundrySettings) -> Iterator[AzureOpenAI]:
    token_provider = get_bearer_token_provider(
        get_azure_credential(),
        "https://cognitiveservices.azure.com/.default",
    )
    with AzureOpenAI(
        azure_endpoint=_azure_openai_endpoint(settings.endpoint or ""),
        api_version="2025-04-01-preview",
        azure_ad_token_provider=token_provider,
    ) as openai_client:
        yield openai_client


def generate_image(*, model: str, prompt: str, width: int, height: int) -> dict[str, Any]:
    settings = load_settings()
    if not settings.is_configured:
        raise RuntimeError(
            "Foundry is not configured. Set FOUNDRY_PROJECT_ENDPOINT in .env."
        )

    is_mai_model = "mai-image" in model.strip().lower()
    if is_mai_model:
        endpoint = _normalize_endpoint(settings.endpoint or "")
        parsed = urlparse(endpoint)
        url = f"{parsed.scheme}://{parsed.netloc}/mai/v1/images/generations"
        token_scope = "https://cognitiveservices.azure.com/.default"
        payload = {
            "model": model,
            "prompt": prompt,
            "width": width,
            "height": height,
        }
        api_name = "MAI"
        output_width, output_height = width, height
    else:
        url = f"{_openai_base_url(settings.endpoint or '')}/images/generations"
        token_scope = "https://ai.azure.com/.default"
        size = _openai_image_size(width, height)
        payload = {
            "model": model,
            "prompt": prompt,
            "size": size,
        }
        api_name = "OpenAI"
        output_width, output_height = (int(value) for value in size.split("x"))

    token = get_azure_credential().get_token(token_scope).token
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    started = time.perf_counter()
    try:
        with urlopen(request, timeout=180) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            error = json.loads(detail)
            detail = error.get("error", {}).get("message") or error.get("detail") or detail
        except json.JSONDecodeError:
            pass
        raise RuntimeError(f"{api_name} image generation failed ({exc.code}): {detail}") from exc
    except URLError as exc:
        raise RuntimeError(
            f"Could not reach the {api_name} image generation endpoint: {exc.reason}"
        ) from exc

    image = next(
        (item for item in result.get("data", []) if item.get("b64_json")),
        None,
    )
    if image is None:
        raise RuntimeError(f"{api_name} image generation returned no image data.")
    return {
        "model": model,
        "image_base64": image["b64_json"],
        "mime_type": "image/png",
        "width": output_width,
        "height": output_height,
        "duration_ms": round((time.perf_counter() - started) * 1000),
    }


def edit_image(
    *,
    model: str,
    prompt: str,
    image: bytes,
    image_content_type: str,
    width: int,
    height: int,
) -> dict[str, Any]:
    settings = load_settings()
    if not settings.is_configured:
        raise RuntimeError(
            "Foundry is not configured. Set FOUNDRY_PROJECT_ENDPOINT in .env."
        )

    size = _openai_image_size(width, height)
    boundary = f"foundry-chat-{uuid.uuid4().hex}"
    fields = {
        "model": model,
        "prompt": prompt,
        "size": size,
    }
    parts: list[bytes] = []
    for name, value in fields.items():
        parts.append((
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
            f"{value}\r\n"
        ).encode("utf-8"))
    parts.extend(
        [
            (
                f"--{boundary}\r\n"
                'Content-Disposition: form-data; name="image"; filename="source-image"\r\n'
                f"Content-Type: {image_content_type}\r\n\r\n"
            ).encode("utf-8"),
            image,
            b"\r\n",
            f"--{boundary}--\r\n".encode("utf-8"),
        ]
    )

    token = get_azure_credential().get_token("https://ai.azure.com/.default").token
    request = Request(
        f"{_openai_base_url(settings.endpoint or '')}/images/edits",
        data=b"".join(parts),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    started = time.perf_counter()
    try:
        with urlopen(request, timeout=180) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            error = json.loads(detail)
            detail = error.get("error", {}).get("message") or error.get("detail") or detail
        except json.JSONDecodeError:
            pass
        raise RuntimeError(f"OpenAI image edit failed ({exc.code}): {detail}") from exc
    except URLError as exc:
        raise RuntimeError(
            f"Could not reach the OpenAI image edit endpoint: {exc.reason}"
        ) from exc

    edited_image = next(
        (item for item in result.get("data", []) if item.get("b64_json")),
        None,
    )
    if edited_image is None:
        raise RuntimeError("OpenAI image edit returned no image data.")
    output_width, output_height = (int(value) for value in size.split("x"))
    return {
        "model": model,
        "image_base64": edited_image["b64_json"],
        "mime_type": "image/png",
        "width": output_width,
        "height": output_height,
        "duration_ms": round((time.perf_counter() - started) * 1000),
    }


def _openai_image_size(width: int, height: int) -> str:
    if width == height:
        return "1024x1024"
    if width > height:
        return "1536x1024"
    return "1024x1536"


def complete_chat(
    *,
    model: str,
    prompt: str,
    api_surface: str,
    system_prompt: str,
    temperature: float,
    top_p: float,
    max_tokens: int,
    repetition_penalty: float = 1.0,
    reasoning_effort: str | None = None,
    history: list[dict[str, str]] | None = None,
    guardrail_policy_name: str | None = None,
) -> dict[str, Any]:
    settings = load_settings()
    if not settings.is_configured:
        raise RuntimeError(
            "Foundry is not configured. Set FOUNDRY_PROJECT_ENDPOINT in .env."
        )

    started = time.perf_counter()
    foundry_request = build_foundry_request_trace(
        model=model,
        prompt=prompt,
        api_surface=api_surface,
        system_prompt=system_prompt,
        temperature=temperature,
        top_p=top_p,
        max_tokens=max_tokens,
        repetition_penalty=repetition_penalty,
        reasoning_effort=reasoning_effort,
        history=history,
        guardrail_policy_name=guardrail_policy_name,
    )
    extra_headers = (
        {"x-policy-id": guardrail_policy_name} if guardrail_policy_name else None
    )
    with _create_openai_client(settings) as openai_client:
        if api_surface == "chat_completions":
            request = foundry_request["payload"]
            response = openai_client.chat.completions.create(
                **request,
                extra_headers=extra_headers,
            )
            content = response.choices[0].message.content if response.choices else ""
        elif api_surface == "responses":
            request = foundry_request["payload"]
            response = openai_client.responses.create(
                **request,
                extra_headers=extra_headers,
            )
            content = getattr(response, "output_text", "") or ""
        else:
            raise ValueError("API surface must be 'responses' or 'chat_completions'.")
    duration_ms = round((time.perf_counter() - started) * 1000)

    usage = getattr(response, "usage", None)

    foundry_response = build_foundry_response_trace(
        api_surface=api_surface,
        response=response,
        content=content,
        usage=usage,
    )
    return {
        "model": model,
        "api_surface": api_surface,
        "content": content,
        "duration_ms": duration_ms,
        "usage": _usage_to_dict(usage),
        "guardrail_policy_name": guardrail_policy_name,
        "guardrail_results": foundry_response["extracted"]["guardrail_results"],
        "foundry_request": redact_foundry_trace(foundry_request),
        "foundry_response": redact_foundry_trace(foundry_response),
    }


def create_embeddings(
    *,
    inputs: list[str],
    model: str | None = None,
) -> dict[str, Any]:
    settings = load_settings()
    if not settings.is_configured:
        raise RuntimeError(
            "Foundry is not configured. Set FOUNDRY_PROJECT_ENDPOINT in .env."
        )
    normalized_inputs = [item.strip() for item in inputs if item.strip()]
    if not normalized_inputs:
        raise RuntimeError("Embedding input cannot be empty.")

    embedding_model = (model or settings.embedding_model).strip()
    started = time.perf_counter()
    request = {
        "model": embedding_model,
        "input": normalized_inputs,
    }
    with _create_openai_client(settings) as openai_client:
        response = openai_client.embeddings.create(**request)

    vectors = [item.embedding for item in response.data]
    return {
        "model": embedding_model,
        "vectors": vectors,
        "duration_ms": round((time.perf_counter() - started) * 1000),
        "foundry_request": {
            "api_surface": "embeddings",
            "method": "POST",
            "path": "/embeddings",
            "payload": {
                "model": embedding_model,
                "input_count": len(normalized_inputs),
                "input_characters": sum(len(item) for item in normalized_inputs),
            },
        },
        "foundry_response": {
            "api_surface": "embeddings",
            "payload": {
                "model": getattr(response, "model", embedding_model),
                "embedding_count": len(vectors),
                "dimensions": len(vectors[0]) if vectors else 0,
                "usage": _usage_to_dict(getattr(response, "usage", None)),
            },
        },
    }


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
        raise RuntimeError("Set FOUNDRY_TRANSCRIPTION_MODEL to your transcription deployment name.")
    if not audio:
        raise RuntimeError("Recorded audio was empty.")

    started = time.perf_counter()
    audio_file = BytesIO(audio)
    audio_file.name = filename or "recording.webm"
    request = {
        "model": transcription_model,
        "file": {
            "filename": audio_file.name,
            "content_type": content_type,
            "bytes": len(audio),
        },
    }

    with _create_audio_client(settings) as openai_client:
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
        raise RuntimeError("Azure Speech transcription is not configured. Set AZURE_SPEECH_ENDPOINT.")
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
            "Foundry STT/TTS is not configured. Set FOUNDRY_PROJECT_ENDPOINT and audio model deployments."
        )

    speech_model = (model or settings.tts_model).strip()
    speech_voice = (voice or settings.tts_voice).strip() or "alloy"
    if not speech_model:
        raise RuntimeError("Set FOUNDRY_TTS_MODEL to your text-to-speech deployment name.")
    if not text.strip():
        raise RuntimeError("Cannot synthesize an empty response.")

    started = time.perf_counter()
    with _create_audio_client(settings) as openai_client:
        if "gpt-audio" in speech_model.lower():
            request = {
                "model": speech_model,
                "modalities": ["text", "audio"],
                "audio": {"voice": speech_voice, "format": "mp3"},
                "messages": [{"role": "user", "content": text}],
            }
            response = openai_client.chat.completions.create(**request)
            response_audio = response.choices[0].message.audio
            if response_audio is None or not response_audio.data:
                raise RuntimeError("Audio completion response did not include audio bytes.")
            audio = base64.b64decode(response_audio.data)
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

    return {
        "model": speech_model,
        "voice": speech_voice,
        "audio": audio,
        "audio_mime_type": "audio/mpeg",
        "duration_ms": round((time.perf_counter() - started) * 1000),
        "foundry_request": {
            "api_surface": api_surface,
            "method": "POST",
            "path": path,
            "payload": {"model": speech_model, "voice": speech_voice, "input_characters": len(text)},
        },
        "foundry_response": {
            "api_surface": api_surface,
            "payload": {
                "audio_mime_type": "audio/mpeg",
                "bytes": len(audio),
            },
        },
    }


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
                "output": {
                    "voice": voice.strip() or "alloy",
                },
            },
        },
    }

    bearer_token = get_azure_credential().get_token("https://ai.azure.com/.default").token

    request = Request(
        token_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {bearer_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Realtime client secret request failed with {exc.code}: {detail}"
        ) from exc
    except URLError as exc:
        raise RuntimeError(f"Realtime client secret request failed: {exc.reason}") from exc

    client_secret = data.get("value") or data.get("client_secret", {}).get("value")
    if not client_secret:
        raise RuntimeError("Realtime client secret response did not include a token.")

    return {
        "token": client_secret,
        "webrtc_url": f"{endpoint}/realtime/calls?webrtcfilter=on",
        "model": realtime_model,
        "voice": payload["session"]["audio"]["output"]["voice"],
        "expires_at": data.get("expires_at") or data.get("client_secret", {}).get("expires_at"),
    }


def create_voice_live_connection_info() -> dict[str, str]:
    settings = load_settings()
    if not settings.is_voice_live_configured:
        raise RuntimeError(
            "Voice Live is not configured. Set AZURE_VOICELIVE_ENDPOINT to the "
            "Foundry or Azure Speech resource endpoint."
        )

    endpoint = (settings.voice_live_endpoint or "").rstrip("/")
    parsed = urlparse(endpoint)
    if not parsed.scheme or not parsed.netloc:
        raise RuntimeError("AZURE_VOICELIVE_ENDPOINT must be an absolute HTTPS endpoint.")
    websocket_scheme = "wss" if parsed.scheme == "https" else "ws"
    websocket_url = (
        f"{websocket_scheme}://{parsed.netloc}/voice-live/realtime/calls"
        f"?api-version=2026-04-10&model={settings.voice_live_model}"
    )
    token = get_azure_credential().get_token("https://ai.azure.com/.default").token
    return {
        "url": websocket_url,
        "token": token,
        "model": settings.voice_live_model,
        "voice": settings.voice_live_voice,
    }


def stream_chat(
    *,
    model: str,
    prompt: str,
    api_surface: str,
    system_prompt: str,
    temperature: float,
    top_p: float,
    max_tokens: int,
    repetition_penalty: float = 1.0,
    reasoning_effort: str | None = None,
    history: list[dict[str, str]] | None = None,
    guardrail_policy_name: str | None = None,
) -> Iterator[dict[str, Any]]:
    settings = load_settings()
    if not settings.is_configured:
        raise RuntimeError(
            "Foundry is not configured. Set FOUNDRY_PROJECT_ENDPOINT in .env."
        )

    started = time.perf_counter()
    chunks: list[str] = []
    usage: Any = None
    foundry_events: list[Any] = []
    foundry_request = build_foundry_request_trace(
        model=model,
        prompt=prompt,
        api_surface=api_surface,
        system_prompt=system_prompt,
        temperature=temperature,
        top_p=top_p,
        max_tokens=max_tokens,
        repetition_penalty=repetition_penalty,
        reasoning_effort=reasoning_effort,
        history=history,
        guardrail_policy_name=guardrail_policy_name,
    )
    yield {"type": "foundry_request", "request": redact_foundry_trace(foundry_request)}

    extra_headers = (
        {"x-policy-id": guardrail_policy_name} if guardrail_policy_name else None
    )
    with _create_openai_client(settings) as openai_client:
        if api_surface == "chat_completions":
            request = foundry_request["payload"]
            stream = openai_client.chat.completions.create(
                **request,
                stream=True,
                extra_headers=extra_headers,
            )
            for event in stream:
                if len(foundry_events) < 200:
                    foundry_events.append(event)
                usage = getattr(event, "usage", None) or usage
                if not event.choices:
                    continue
                delta = getattr(event.choices[0].delta, "content", None)
                if delta:
                    chunks.append(delta)
                    yield {"type": "delta", "delta": delta}
        elif api_surface == "responses":
            request = foundry_request["payload"]
            stream = openai_client.responses.create(
                **request,
                stream=True,
                extra_headers=extra_headers,
            )
            for event in stream:
                if len(foundry_events) < 200:
                    foundry_events.append(event)
                event_type = getattr(event, "type", "")
                if event_type == "response.output_text.delta":
                    delta = getattr(event, "delta", "")
                    if delta:
                        chunks.append(delta)
                        yield {"type": "delta", "delta": delta}
                elif event_type == "response.completed":
                    response = getattr(event, "response", None)
                    usage = getattr(response, "usage", None) or usage
        else:
            raise ValueError("API surface must be 'responses' or 'chat_completions'.")

    content = "".join(chunks)
    foundry_response = build_foundry_stream_response_trace(
        api_surface=api_surface,
        events=foundry_events,
        content=content,
        usage=usage,
    )
    yield {
        "type": "foundry_response",
        "response": redact_foundry_trace(foundry_response),
    }
    yield {
        "type": "completed",
        "content": content,
        "duration_ms": round((time.perf_counter() - started) * 1000),
        "usage": _usage_to_dict(usage),
        "guardrail_policy_name": guardrail_policy_name,
        "guardrail_results": foundry_response["extracted"]["guardrail_results"],
    }
