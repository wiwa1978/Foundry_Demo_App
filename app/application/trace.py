from typing import Any

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
