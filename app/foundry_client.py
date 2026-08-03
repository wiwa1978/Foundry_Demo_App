import os
import time
from io import BytesIO
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential, get_bearer_token_provider
from openai import OpenAI

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
    def auth_mode(self) -> str:
        return "entra_id"


def load_settings() -> FoundrySettings:
    seed_models = [
        model.strip()
        for model in os.getenv("FOUNDRY_MODELS", "").split(",")
        if model.strip()
    ]
    models = list_models(seed_models)
    realtime_model = (
        os.getenv("FOUNDRY_REALTIME_MODEL")
        or next((model for model in models if "realtime" in model.lower()), None)
        or "gpt-realtime-2.1"
    )

    return FoundrySettings(
        endpoint=(
            os.getenv("FOUNDRY_PROJECT_ENDPOINT")
            or os.getenv("AZURE_AI_PROJECT_ENDPOINT")
            or os.getenv("AZURE_AIPROJECT_ENDPOINT")
            or os.getenv("FOUNDRY_OPENAI_ENDPOINT")
            or os.getenv("AZURE_OPENAI_ENDPOINT")
            or os.getenv("FOUNDRY_ENDPOINT")
        ),
        models=models,
        realtime_endpoint=(
            os.getenv("FOUNDRY_REALTIME_ENDPOINT")
            or os.getenv("AZURE_OPENAI_ENDPOINT")
            or os.getenv("FOUNDRY_OPENAI_ENDPOINT")
            or os.getenv("FOUNDRY_PROJECT_ENDPOINT")
            or os.getenv("AZURE_AI_PROJECT_ENDPOINT")
            or os.getenv("AZURE_AIPROJECT_ENDPOINT")
            or os.getenv("FOUNDRY_ENDPOINT")
        ),
        realtime_model=realtime_model,
        embedding_model=os.getenv("FOUNDRY_EMBEDDING_MODEL") or "text-embedding-3-small",
        transcription_model=(
            os.getenv("FOUNDRY_TRANSCRIPTION_MODEL")
            or os.getenv("AZURE_OPENAI_TRANSCRIPTION_MODEL")
            or "gpt-4o-mini-transcribe"
        ),
        tts_model=(
            os.getenv("FOUNDRY_TTS_MODEL")
            or os.getenv("AZURE_OPENAI_TTS_MODEL")
            or "gpt-4o-mini-tts"
        ),
        tts_voice=os.getenv("FOUNDRY_TTS_VOICE") or "alloy",
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
        return {
            "api_surface": api_surface,
            "method": "POST",
            "path": "/chat/completions",
            "payload": request,
        }
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
        return {
            "api_surface": api_surface,
            "method": "POST",
            "path": "/responses",
            "payload": request,
        }
    raise ValueError("API surface must be 'responses' or 'chat_completions'.")


def build_foundry_response_trace(
    *,
    api_surface: str,
    response: Any,
    content: str,
    usage: Any,
) -> dict[str, Any]:
    return {
        "api_surface": api_surface,
        "payload": _serialize_openai_payload(response),
        "extracted": {
            "content": content,
            "usage": _usage_to_dict(usage),
        },
    }


def build_foundry_stream_response_trace(
    *,
    api_surface: str,
    events: list[Any],
    content: str,
    usage: Any,
) -> dict[str, Any]:
    return {
        "api_surface": api_surface,
        "events": [_serialize_openai_payload(event) for event in events],
        "extracted": {
            "content": content,
            "usage": _usage_to_dict(usage),
        },
    }


def _normalize_endpoint(endpoint_value: str) -> str:
    endpoint = endpoint_value.rstrip("/")
    if endpoint.endswith("/models"):
        raise RuntimeError(
            "FOUNDRY_PROJECT_ENDPOINT must be a Foundry project endpoint like "
            "https://<resource-name>.services.ai.azure.com/api/projects/<project-name>, "
            "not the legacy /models inference endpoint."
        )
    return endpoint


def _is_openai_endpoint(endpoint_value: str) -> bool:
    return _normalize_endpoint(endpoint_value).endswith("/openai/v1")


def _openai_base_url(endpoint_value: str) -> str:
    endpoint = _normalize_endpoint(endpoint_value)
    if endpoint.endswith("/openai/v1"):
        return endpoint
    return f"{endpoint}/openai/v1"


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
    if _is_openai_endpoint(endpoint):
        token_provider = get_bearer_token_provider(
            DefaultAzureCredential(),
            "https://ai.azure.com/.default",
        )
        with OpenAI(
            base_url=_openai_base_url(endpoint),
            api_key=token_provider,
        ) as openai_client:
            yield openai_client
        return

    with (
        DefaultAzureCredential() as credential,
        AIProjectClient(endpoint=endpoint, credential=credential) as project_client,
        project_client.get_openai_client() as openai_client,
    ):
        yield openai_client


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
    )
    with _create_openai_client(settings) as openai_client:
        if api_surface == "chat_completions":
            request = foundry_request["payload"]
            response = openai_client.chat.completions.create(**request)
            content = response.choices[0].message.content if response.choices else ""
        elif api_surface == "responses":
            request = foundry_request["payload"]
            response = openai_client.responses.create(**request)
            content = getattr(response, "output_text", "") or ""
        else:
            raise ValueError("API surface must be 'responses' or 'chat_completions'.")
    duration_ms = round((time.perf_counter() - started) * 1000)

    usage = getattr(response, "usage", None)

    return {
        "model": model,
        "api_surface": api_surface,
        "content": content,
        "duration_ms": duration_ms,
        "usage": _usage_to_dict(usage),
        "foundry_request": foundry_request,
        "foundry_response": build_foundry_response_trace(
            api_surface=api_surface,
            response=response,
            content=content,
            usage=usage,
        ),
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
                "input": [
                    f"{item[:240]}{'...' if len(item) > 240 else ''}"
                    for item in normalized_inputs
                ],
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
    if not settings.is_traditional_voice_configured:
        raise RuntimeError(
            "Foundry STT/TTS is not configured. Set FOUNDRY_PROJECT_ENDPOINT and audio model deployments."
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

    with _create_openai_client(settings) as openai_client:
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
            "payload": _serialize_openai_payload(response),
            "extracted": {"text": text},
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
            "Foundry STT/TTS is not configured. Set FOUNDRY_PROJECT_ENDPOINT and audio model deployments."
        )

    speech_model = (model or settings.tts_model).strip()
    speech_voice = (voice or settings.tts_voice).strip() or "alloy"
    if not speech_model:
        raise RuntimeError("Set FOUNDRY_TTS_MODEL to your text-to-speech deployment name.")
    if not text.strip():
        raise RuntimeError("Cannot synthesize an empty response.")

    started = time.perf_counter()
    request = {
        "model": speech_model,
        "voice": speech_voice,
        "input": text,
        "response_format": "mp3",
    }

    with _create_openai_client(settings) as openai_client:
        response = openai_client.audio.speech.create(**request)

    if hasattr(response, "read"):
        audio = response.read()
    elif isinstance(response, bytes):
        audio = response
    elif hasattr(response, "content"):
        audio = response.content
    else:
        raise RuntimeError("Text-to-speech response did not include audio bytes.")

    return {
        "model": speech_model,
        "voice": speech_voice,
        "audio": audio,
        "audio_mime_type": "audio/mpeg",
        "duration_ms": round((time.perf_counter() - started) * 1000),
        "foundry_request": {
            "api_surface": "audio_speech",
            "method": "POST",
            "path": "/audio/speech",
            "payload": {**request, "input": text[:4000]},
        },
        "foundry_response": {
            "api_surface": "audio_speech",
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

    with DefaultAzureCredential() as credential:
        bearer_token = credential.get_token("https://ai.azure.com/.default").token

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
    )
    yield {"type": "foundry_request", "request": foundry_request}

    with _create_openai_client(settings) as openai_client:
        if api_surface == "chat_completions":
            request = foundry_request["payload"]
            stream = openai_client.chat.completions.create(**request, stream=True)
            for event in stream:
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
            stream = openai_client.responses.create(**request, stream=True)
            for event in stream:
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
    yield {
        "type": "foundry_response",
        "response": build_foundry_stream_response_trace(
            api_surface=api_surface,
            events=foundry_events,
            content=content,
            usage=usage,
        ),
    }
    yield {
        "type": "completed",
        "content": content,
        "duration_ms": round((time.perf_counter() - started) * 1000),
        "usage": _usage_to_dict(usage),
    }
