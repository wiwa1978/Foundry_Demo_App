from typing import Any, TypedDict


class UsageTrace(TypedDict):
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None


TraceData = dict[str, Any]

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


def usage_to_dict(usage: Any) -> UsageTrace:
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


def serialize_openai_payload(value: Any) -> Any:
    if value is None or isinstance(value, str | int | float | bool):
        return value
    if isinstance(value, list | tuple):
        return [serialize_openai_payload(item) for item in value]
    if isinstance(value, dict):
        return {str(key): serialize_openai_payload(item) for key, item in value.items()}
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if hasattr(value, "to_dict"):
        return value.to_dict()
    return repr(value)


def build_foundry_response_trace(
    *,
    api_surface: str,
    response: Any,
    content: str,
    usage: Any,
) -> TraceData:
    payload = serialize_openai_payload(response)
    return {
        "api_surface": api_surface,
        "payload": payload,
        "extracted": {
            "content": content,
            "usage": usage_to_dict(usage),
            "guardrail_results": _extract_guardrail_results(payload),
            "model": _extract_response_model(payload),
        },
    }


def build_foundry_stream_response_trace(
    *,
    api_surface: str,
    events: list[Any],
    content: str,
    usage: Any,
) -> TraceData:
    serialized_events = [serialize_openai_payload(event) for event in events]
    return {
        "api_surface": api_surface,
        "events": serialized_events,
        "extracted": {
            "content": content,
            "usage": usage_to_dict(usage),
            "guardrail_results": _extract_stream_guardrail_results(serialized_events),
            "model": _extract_stream_response_model(serialized_events),
        },
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


def _extract_response_model(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    model = payload.get("model")
    return model if isinstance(model, str) and model.strip() else None


def _extract_stream_response_model(events: list[Any]) -> str | None:
    for event in events:
        model = _extract_response_model(event)
        if model:
            return model
    return None


def _extract_guardrail_results(payload: Any) -> TraceData | None:
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


def _extract_stream_guardrail_results(events: list[Any]) -> TraceData | None:
    event_results = [
        result for event in events if (result := _extract_guardrail_results(event)) is not None
    ]
    return {"events": event_results} if event_results else None
