import asyncio
import json
import logging
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
from usecases_media.text_translation.backend.schemas import TextTranslationRequest

TRANSLATOR_API_VERSION = "2025-10-01-preview"
TRANSLATOR_PATH = "/translator/text/translate"
REQUEST_TIMEOUT_SECONDS = 30

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TextTranslatorSettings:
    endpoint: str | None
    subscription_key: str | None
    api_version: str = TRANSLATOR_API_VERSION

    @property
    def is_configured(self) -> bool:
        return bool(self.endpoint)


def load_text_translator_settings() -> TextTranslatorSettings:
    settings = load_settings()
    return TextTranslatorSettings(
        endpoint=settings.translator_endpoint,
        subscription_key=settings.translator_key,
        api_version=first_env(
            "FOUNDRY_TRANSLATOR_API_VERSION",
            "AZURE_TRANSLATOR_API_VERSION",
            default=TRANSLATOR_API_VERSION,
        )
        or TRANSLATOR_API_VERSION,
    )


class TranslatorHttpError(RuntimeError):
    def __init__(self, status_code: int, body: str) -> None:
        super().__init__(f"Translator request failed with HTTP {status_code}.")
        self.status_code = status_code
        self.body = body


PostJson = Callable[[str, Mapping[str, str], dict[str, Any]], dict[str, Any]]
TokenProvider = Callable[[], str]


def _translator_token() -> str:
    return get_azure_credential().get_token("https://cognitiveservices.azure.com/.default").token


def _translator_headers(
    settings: TextTranslatorSettings,
    token_provider: TokenProvider | None = None,
) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if settings.subscription_key:
        headers["Ocp-Apim-Subscription-Key"] = settings.subscription_key
    else:
        headers["Authorization"] = f"Bearer {(token_provider or _translator_token)()}"
    return headers



def _translator_url(settings: TextTranslatorSettings) -> str:
    endpoint = (settings.endpoint or "").rstrip("/")
    query = urlencode({"api-version": settings.api_version})
    return f"{endpoint}{TRANSLATOR_PATH}?{query}"


def post_translator_json(
    url: str,
    headers: Mapping[str, str],
    body: dict[str, Any],
) -> dict[str, Any]:
    payload = json.dumps(body).encode("utf-8")
    request = Request(url, data=payload, headers=dict(headers), method="POST")  # noqa: S310
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:  # noqa: S310
            response_body = response.read().decode("utf-8")
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise TranslatorHttpError(exc.code, error_body) from exc
    except URLError as exc:
        raise ExternalServiceError("Text translation") from exc
    try:
        parsed = json.loads(response_body)
    except json.JSONDecodeError as exc:
        raise ExternalServiceError("Text translation") from exc
    if not isinstance(parsed, dict):
        raise ExternalServiceError("Text translation")
    return parsed


def _build_translator_body(request: TextTranslationRequest) -> dict[str, Any]:
    item: dict[str, Any] = {
        "Text": request.text,
        "targets": [{"language": request.target_language}],
    }
    if request.source_language:
        item["language"] = request.source_language
    return {"inputs": [item]}


def _detected_language(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        language = value.get("language") or value.get("Language")
        return language if isinstance(language, str) and language else None
    return None


def _parse_translator_response(
    payload: dict[str, Any],
    *,
    request: TextTranslationRequest,
) -> dict[str, Any]:
    values = payload.get("value")
    if not isinstance(values, list) or not values:
        raise ExternalServiceError("Text translation")
    first = values[0]
    if not isinstance(first, dict):
        raise ExternalServiceError("Text translation")
    raw_translations = first.get("translations")
    if not isinstance(raw_translations, list) or not raw_translations:
        raise ExternalServiceError("Text translation")

    translations: list[dict[str, str]] = []
    for raw in raw_translations:
        if not isinstance(raw, dict):
            continue
        language = raw.get("language")
        text = raw.get("text")
        if isinstance(language, str) and isinstance(text, str):
            translations.append({"language": language, "text": text})
    if not translations:
        raise ExternalServiceError("Text translation")

    selected = next(
        (
            item
            for item in translations
            if item["language"].lower() == request.target_language.lower()
        ),
        translations[0],
    )
    return {
        "source_language": request.source_language,
        "detected_language": _detected_language(
            first.get("detectedLanguage") or first.get("detected_language")
        ),
        "target_language": selected["language"],
        "translated_text": selected["text"],
        "translations": translations,
    }


async def translate_text(
    request: TextTranslationRequest,
    *,
    settings: TextTranslatorSettings | None = None,
    post_json: PostJson | None = None,
    token_provider: TokenProvider | None = None,
) -> dict[str, Any]:
    translator_settings = settings or load_text_translator_settings()
    if not translator_settings.is_configured:
        raise InvalidRequestError(
            "Text Translation is not configured. Set FOUNDRY_PROJECT_ENDPOINT or "
            "FOUNDRY_TRANSLATOR_ENDPOINT."
        )

    headers = _translator_headers(translator_settings, token_provider)
    body = _build_translator_body(request)
    url = _translator_url(translator_settings)
    logger.info(
        "text_translation_started source=%s target=%s characters=%s",
        request.source_language or "auto",
        request.target_language,
        len(request.text),
    )
    try:
        response = await asyncio.to_thread(post_json or post_translator_json, url, headers, body)
    except TranslatorHttpError as exc:
        if exc.status_code in {401, 403}:
            raise ServiceAuthorizationError(
                "Azure Translator rejected the configured key or Entra credential."
            ) from exc
        if exc.status_code == 400:
            raise InvalidRequestError("Azure Translator rejected the text or language selection.") from exc
        logger.warning(
            "text_translation_http_failed status=%s body=%s",
            exc.status_code,
            exc.body[:500],
        )
        raise ExternalServiceError("Text translation") from exc

    result = _parse_translator_response(response, request=request)
    logger.info(
        "text_translation_completed source=%s target=%s translated_characters=%s",
        result["detected_language"] or result["source_language"] or "auto",
        result["target_language"],
        len(result["translated_text"]),
    )
    return result
