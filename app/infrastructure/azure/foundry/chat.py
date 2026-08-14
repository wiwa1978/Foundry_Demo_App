import time
from collections.abc import Iterator
from typing import Any

from app.infrastructure.azure.foundry.clients import (
    create_mai_openai_client,
    create_openai_client,
    create_project_openai_client,
)
from app.infrastructure.azure.foundry.settings import load_settings
from app.infrastructure.azure.foundry.tracing import (
    TraceData,
    build_foundry_response_trace,
    build_foundry_stream_response_trace,
    redact_foundry_trace,
    usage_to_dict,
)

MAI_THINKING_MODEL_PREFIXES = ("mai-thinking", "mai-thinkin")
SAMPLING_UNSUPPORTED_MODEL_PREFIXES = (
    "gpt-5",
    "gpt5",
    "o1",
    "o3",
    "o4",
    *MAI_THINKING_MODEL_PREFIXES,
)
ROUTER_MODEL_NAMES = {"model-router"}


def _is_router_model(model: str) -> bool:
    return model.strip().lower().replace("_", "-") in ROUTER_MODEL_NAMES


def _client_factory_for(model: str, api_surface: str):
    if api_surface == "responses" and _is_router_model(model):
        return create_project_openai_client
    return create_mai_openai_client if _uses_mai_endpoint(model) else create_openai_client


def _emulate_stream_from_response(
    *,
    api_surface: str,
    response: Any,
    content: str,
    usage: Any,
    started: float,
    guardrail_policy_name: str | None,
) -> Iterator[dict[str, Any]]:
    if content:
        yield {"type": "delta", "delta": content}
    foundry_response = build_foundry_response_trace(
        api_surface=api_surface,
        response=response,
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
        "usage": usage_to_dict(usage),
        "guardrail_policy_name": guardrail_policy_name,
        "guardrail_results": foundry_response["extracted"]["guardrail_results"],
        "routed_model": foundry_response["extracted"].get("model"),
    }


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


def _supports_sampling_parameters(model: str) -> bool:
    normalized_model = model.strip().lower().replace("_", "-")
    return not normalized_model.startswith(SAMPLING_UNSUPPORTED_MODEL_PREFIXES)


def _uses_mai_endpoint(model: str) -> bool:
    normalized_model = model.strip().lower().replace("_", "-")
    return normalized_model.startswith(MAI_THINKING_MODEL_PREFIXES)


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
    if _supports_sampling_parameters(model) and not _is_router_model(model):
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
) -> TraceData:
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
        trace: TraceData = {
            "api_surface": api_surface,
            "method": "POST",
            "path": "/chat/completions",
            "payload": request,
        }
    elif api_surface == "responses":
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
    else:
        raise ValueError("API surface must be 'responses' or 'chat_completions'.")
    if guardrail_policy_name:
        trace["headers"] = {"x-policy-id": guardrail_policy_name}
    return trace


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
        raise RuntimeError("Foundry is not configured. Set FOUNDRY_PROJECT_ENDPOINT in .env.")

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
    extra_headers = {"x-policy-id": guardrail_policy_name} if guardrail_policy_name else None
    response: Any
    client_factory = _client_factory_for(model, api_surface)
    with client_factory(settings) as openai_client:
        request = foundry_request["payload"]
        if api_surface == "chat_completions":
            response = openai_client.chat.completions.create(
                **request,
                extra_headers=extra_headers,
            )
            content = response.choices[0].message.content if response.choices else ""
        elif api_surface == "responses":
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
        "usage": usage_to_dict(usage),
        "guardrail_policy_name": guardrail_policy_name,
        "guardrail_results": foundry_response["extracted"]["guardrail_results"],
        "routed_model": foundry_response["extracted"].get("model"),
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
        raise RuntimeError("Foundry is not configured. Set FOUNDRY_PROJECT_ENDPOINT in .env.")
    normalized_inputs = [item.strip() for item in inputs if item.strip()]
    if not normalized_inputs:
        raise RuntimeError("Embedding input cannot be empty.")

    embedding_model = (model or settings.embedding_model).strip()
    started = time.perf_counter()
    with create_openai_client(settings) as openai_client:
        response = openai_client.embeddings.create(
            model=embedding_model,
            input=normalized_inputs,
        )

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
                "usage": usage_to_dict(getattr(response, "usage", None)),
            },
        },
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
        raise RuntimeError("Foundry is not configured. Set FOUNDRY_PROJECT_ENDPOINT in .env.")

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
    client_factory = _client_factory_for(model, api_surface)
    with client_factory(settings) as openai_client:
        request = foundry_request["payload"]
        stream: Any
        if api_surface == "chat_completions":
            if _is_router_model(model):
                response = openai_client.chat.completions.create(
                    **request,
                    extra_headers=extra_headers,
                )
                content = response.choices[0].message.content if response.choices else ""
                usage = getattr(response, "usage", None)
                yield from _emulate_stream_from_response(
                    api_surface=api_surface,
                    response=response,
                    content=content,
                    usage=usage,
                    started=started,
                    guardrail_policy_name=guardrail_policy_name,
                )
                return
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
            if _is_router_model(model):
                response = openai_client.responses.create(
                    **request,
                    extra_headers=extra_headers,
                )
                content = getattr(response, "output_text", "") or ""
                usage = getattr(response, "usage", None)
                yield from _emulate_stream_from_response(
                    api_surface=api_surface,
                    response=response,
                    content=content,
                    usage=usage,
                    started=started,
                    guardrail_policy_name=guardrail_policy_name,
                )
                return
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
        "usage": usage_to_dict(usage),
        "guardrail_policy_name": guardrail_policy_name,
        "guardrail_results": foundry_response["extracted"]["guardrail_results"],
        "routed_model": foundry_response["extracted"].get("model"),
    }
