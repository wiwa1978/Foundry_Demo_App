from typing import Any

CONTENT_FILTER_MESSAGE = (
    "Request blocked by the configured content safety policy. Modify your prompt and try again."
)


def guardrail_error_details(exc: Exception) -> dict[str, Any] | None:
    body = getattr(exc, "body", None)
    return body if isinstance(body, dict) else None


def public_provider_error(operation: str, exc: Exception) -> str:
    body = guardrail_error_details(exc)
    if body is not None:
        error = body.get("error")
        details = error if isinstance(error, dict) else body
        code = details.get("code")
        if isinstance(code, str) and code.lower() == "content_filter":
            return CONTENT_FILTER_MESSAGE
    return f"{operation} failed. Try again later."
