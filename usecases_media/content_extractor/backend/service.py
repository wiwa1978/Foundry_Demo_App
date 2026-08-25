import asyncio
import base64
import json
import logging
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.core.config import first_env
from app.core.errors import ExternalServiceError, InvalidRequestError, ServiceAuthorizationError
from app.infrastructure.azure.credentials import get_azure_credential
from app.infrastructure.azure.foundry.settings import load_settings

CONTENT_UNDERSTANDING_API_VERSION = "2025-11-01"
IMAGE_ANALYZER_ID = "prebuilt-imageSearch"
AUDIO_ANALYZER_ID = "prebuilt-callCenter"
REQUEST_TIMEOUT_SECONDS = 30
POLL_INTERVAL_SECONDS = 1
MAX_POLL_SECONDS = 60

# Document-mode analyzer choices, keyed by the value the frontend sends in the
# `analyzer` form field. IDs verified against the Content Understanding
# prebuilt analyzer catalog (GA API version 2025-11-01):
# https://learn.microsoft.com/azure/ai-services/content-understanding/concepts/prebuilt-analyzers
DOCUMENT_ANALYZERS: dict[str, str] = {
    "layout": "prebuilt-layout",
    "invoice": "prebuilt-invoice",
    "tax_us": "prebuilt-tax.us",
    "fields": "prebuilt-documentFields",
    "read": "prebuilt-read",
}
DEFAULT_DOCUMENT_ANALYZER = "layout"

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ContentUnderstandingSettings:
    endpoint: str | None
    subscription_key: str | None
    api_version: str = CONTENT_UNDERSTANDING_API_VERSION

    @property
    def is_configured(self) -> bool:
        return bool(self.endpoint)


def load_content_understanding_settings() -> ContentUnderstandingSettings:
    settings = load_settings()
    return ContentUnderstandingSettings(
        endpoint=settings.content_understanding_endpoint,
        subscription_key=settings.content_understanding_key,
        api_version=first_env(
            "FOUNDRY_CONTENT_UNDERSTANDING_API_VERSION",
            "AZURE_CONTENT_UNDERSTANDING_API_VERSION",
            default=CONTENT_UNDERSTANDING_API_VERSION,
        )
        or CONTENT_UNDERSTANDING_API_VERSION,
    )


class ContentUnderstandingHttpError(RuntimeError):
    def __init__(self, status_code: int, body: str) -> None:
        super().__init__(f"Content Understanding request failed with HTTP {status_code}.")
        self.status_code = status_code
        self.body = body


@dataclass(frozen=True)
class JsonHttpResponse:
    status_code: int
    headers: Mapping[str, str]
    body: dict[str, Any]


PostJson = Callable[[str, Mapping[str, str], dict[str, Any]], JsonHttpResponse]
GetJson = Callable[[str, Mapping[str, str]], JsonHttpResponse]
TokenProvider = Callable[[], str]


def _content_understanding_token() -> str:
    return get_azure_credential().get_token("https://cognitiveservices.azure.com/.default").token


def _headers(
    settings: ContentUnderstandingSettings,
    token_provider: TokenProvider | None = None,
) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if settings.subscription_key:
        headers["Ocp-Apim-Subscription-Key"] = settings.subscription_key
    else:
        headers["Authorization"] = f"Bearer {(token_provider or _content_understanding_token)()}"
    return headers


def _analyze_url(settings: ContentUnderstandingSettings, analyzer_id: str) -> str:
    endpoint = (settings.endpoint or "").rstrip("/")
    query = urlencode({"api-version": settings.api_version})
    return f"{endpoint}/contentunderstanding/analyzers/{analyzer_id}:analyze?{query}"


def _request_json(url: str, headers: Mapping[str, str], body: dict[str, Any] | None) -> JsonHttpResponse:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = Request(url, data=data, headers=dict(headers), method="POST" if body else "GET")  # noqa: S310
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:  # noqa: S310
            response_body = response.read().decode("utf-8")
            response_headers = dict(response.headers.items())
            status_code = response.status
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise ContentUnderstandingHttpError(exc.code, error_body) from exc
    except URLError as exc:
        raise ExternalServiceError("Content extraction") from exc
    try:
        parsed = json.loads(response_body) if response_body else {}
    except json.JSONDecodeError as exc:
        raise ExternalServiceError("Content extraction") from exc
    if not isinstance(parsed, dict):
        raise ExternalServiceError("Content extraction")
    return JsonHttpResponse(status_code=status_code, headers=response_headers, body=parsed)


def post_content_understanding_json(
    url: str,
    headers: Mapping[str, str],
    body: dict[str, Any],
) -> JsonHttpResponse:
    return _request_json(url, headers, body)


def get_content_understanding_json(url: str, headers: Mapping[str, str]) -> JsonHttpResponse:
    request_headers = dict(headers)
    request_headers.pop("Content-Type", None)
    return _request_json(url, request_headers, None)


def _operation_location(headers: Mapping[str, str]) -> str | None:
    for key, value in headers.items():
        if key.lower() == "operation-location":
            return value
    return None


def _operation_id(operation_location: str | None) -> str | None:
    if not operation_location:
        return None
    marker = "/analyzerResults/"
    if marker not in operation_location:
        return None
    return operation_location.split(marker, 1)[1].split("?", 1)[0]


def _raise_http_error(exc: ContentUnderstandingHttpError) -> None:
    if exc.status_code in {401, 403}:
        raise ServiceAuthorizationError(
            "Azure Content Understanding rejected the configured key or Entra credential."
        ) from exc
    if exc.status_code == 400:
        raise InvalidRequestError("Azure Content Understanding rejected the uploaded file.") from exc
    logger.warning(
        "content_understanding_http_failed status=%s body=%s",
        exc.status_code,
        exc.body[:500],
    )
    raise ExternalServiceError("Content extraction") from exc


def _extract_fields(result: dict[str, Any]) -> dict[str, Any]:
    contents = result.get("contents")
    if not isinstance(contents, list) or not contents:
        return {}
    first = contents[0]
    fields = first.get("fields") if isinstance(first, dict) else None
    return fields if isinstance(fields, dict) else {}


def _is_image_reference_only(markdown: str) -> bool:
    stripped_lines = [line.strip() for line in markdown.splitlines() if line.strip()]
    return bool(stripped_lines) and all(
        line.startswith("![") and "](" in line and line.endswith(")")
        for line in stripped_lines
    )


def _field_value(field: Any) -> Any:
    if not isinstance(field, dict):
        return field
    for key in (
        "valueString",
        "valueNumber",
        "valueInteger",
        "valueBoolean",
        "valueDate",
        "valueTime",
        "valueJson",
    ):
        if key in field:
            return field[key]
    if "valueObject" in field and isinstance(field["valueObject"], dict):
        return {key: _field_value(value) for key, value in field["valueObject"].items()}
    if "valueArray" in field and isinstance(field["valueArray"], list):
        return [_field_value(value) for value in field["valueArray"]]
    return field


def _fields_to_text(fields: dict[str, Any]) -> str:
    values = {key: _field_value(value) for key, value in fields.items()}
    summary = values.get("Summary") or values.get("summary")
    if isinstance(summary, str) and summary.strip():
        return summary.strip()
    simple_lines = [f"{key}: {value}" for key, value in values.items() if isinstance(value, str)]
    if simple_lines:
        return "\n".join(simple_lines)
    return json.dumps(values, indent=2, ensure_ascii=False) if values else ""


def _extract_markdown(result: dict[str, Any]) -> str:
    contents = result.get("contents")
    if not isinstance(contents, list):
        return ""
    markdown_parts = []
    for content in contents:
        if not isinstance(content, dict) or not isinstance(content.get("markdown"), str):
            continue
        markdown = content["markdown"].strip()
        if markdown and not _is_image_reference_only(markdown):
            markdown_parts.append(markdown)
    return "\n\n".join(markdown_parts)


def _extract_warnings(result: dict[str, Any]) -> list[dict[str, Any]]:
    warnings = result.get("warnings")
    return [item for item in warnings if isinstance(item, dict)] if isinstance(warnings, list) else []


def _response_from_result(
    *,
    mode: str,
    filename: str,
    mime_type: str,
    analyzer_id: str,
    operation_id: str | None,
    status: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    result = payload.get("result") if isinstance(payload.get("result"), dict) else {}
    fields = _extract_fields(result)
    extracted_text = _extract_markdown(result)
    if not extracted_text and fields:
        extracted_text = _fields_to_text(fields)
    return {
        "mode": mode,
        "filename": filename,
        "mime_type": mime_type,
        "analyzer_id": analyzer_id,
        "operation_id": operation_id,
        "status": status,
        "extracted_text": extracted_text,
        "fields": fields,
        "warnings": _extract_warnings(result),
    }


async def analyze_content(
    *,
    mode: str,
    analyzer_id: str,
    filename: str,
    mime_type: str,
    data: bytes,
    settings: ContentUnderstandingSettings | None = None,
    post_json: PostJson | None = None,
    get_json: GetJson | None = None,
    token_provider: TokenProvider | None = None,
) -> dict[str, Any]:
    """Run any Content Understanding prebuilt analyzer and poll until it finishes.

    This is the shared core used by the image/document/audio wrappers below;
    the only thing that varies between modes is which `analyzer_id` is sent.
    """
    content_settings = settings or load_content_understanding_settings()
    if not content_settings.is_configured:
        raise InvalidRequestError(
            "Content Extractor is not configured. Set FOUNDRY_PROJECT_ENDPOINT or "
            "FOUNDRY_CONTENT_UNDERSTANDING_ENDPOINT."
        )

    headers = _headers(content_settings, token_provider)
    body = {
        "inputs": [
            {
                "name": filename,
                "mimeType": mime_type,
                "data": base64.b64encode(data).decode("ascii"),
            }
        ]
    }
    analyze_url = _analyze_url(content_settings, analyzer_id)
    try:
        accepted = await asyncio.to_thread(
            post_json or post_content_understanding_json,
            analyze_url,
            headers,
            body,
        )
    except ContentUnderstandingHttpError as exc:
        _raise_http_error(exc)
    operation_location = _operation_location(accepted.headers)
    operation_id = _operation_id(operation_location)
    if not operation_location:
        raise ExternalServiceError("Content extraction")

    deadline = time.monotonic() + MAX_POLL_SECONDS
    while True:
        try:
            polled = await asyncio.to_thread(
                get_json or get_content_understanding_json,
                operation_location,
                headers,
            )
        except ContentUnderstandingHttpError as exc:
            _raise_http_error(exc)
        status = str(polled.body.get("status", "")).lower()
        if status == "succeeded":
            return _response_from_result(
                mode=mode,
                filename=filename,
                mime_type=mime_type,
                analyzer_id=analyzer_id,
                operation_id=operation_id,
                status="Succeeded",
                payload=polled.body,
            )
        if status in {"failed", "canceled", "cancelled"}:
            raise ExternalServiceError("Content extraction")
        if time.monotonic() >= deadline:
            raise ExternalServiceError("Content extraction")
        await asyncio.sleep(POLL_INTERVAL_SECONDS)


async def extract_image_content(
    *,
    filename: str,
    mime_type: str,
    data: bytes,
    settings: ContentUnderstandingSettings | None = None,
    post_json: PostJson | None = None,
    get_json: GetJson | None = None,
    token_provider: TokenProvider | None = None,
) -> dict[str, Any]:
    return await analyze_content(
        mode="image",
        analyzer_id=IMAGE_ANALYZER_ID,
        filename=filename,
        mime_type=mime_type,
        data=data,
        settings=settings,
        post_json=post_json,
        get_json=get_json,
        token_provider=token_provider,
    )


async def extract_document_content(
    *,
    analyzer: str,
    filename: str,
    mime_type: str,
    data: bytes,
    settings: ContentUnderstandingSettings | None = None,
    post_json: PostJson | None = None,
    get_json: GetJson | None = None,
    token_provider: TokenProvider | None = None,
) -> dict[str, Any]:
    analyzer_id = DOCUMENT_ANALYZERS.get(analyzer)
    if not analyzer_id:
        raise InvalidRequestError(
            f"Unknown document analyzer '{analyzer}'. Choose one of: "
            f"{', '.join(sorted(DOCUMENT_ANALYZERS))}."
        )
    return await analyze_content(
        mode="document",
        analyzer_id=analyzer_id,
        filename=filename,
        mime_type=mime_type,
        data=data,
        settings=settings,
        post_json=post_json,
        get_json=get_json,
        token_provider=token_provider,
    )


async def extract_audio_content(
    *,
    filename: str,
    mime_type: str,
    data: bytes,
    settings: ContentUnderstandingSettings | None = None,
    post_json: PostJson | None = None,
    get_json: GetJson | None = None,
    token_provider: TokenProvider | None = None,
) -> dict[str, Any]:
    return await analyze_content(
        mode="audio",
        analyzer_id=AUDIO_ANALYZER_ID,
        filename=filename,
        mime_type=mime_type,
        data=data,
        settings=settings,
        post_json=post_json,
        get_json=get_json,
        token_provider=token_provider,
    )
