import asyncio
import json
import logging
import threading
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import requests

from app.core.concurrency import run_model_call
from app.core.config import first_env
from app.core.errors import ExternalServiceError, InvalidRequestError, ServiceAuthorizationError
from app.infrastructure.azure.credentials import get_azure_credential
from app.infrastructure.azure.foundry.settings import load_settings
from usecases_media.text_translation.backend.schemas import (
    AZURE_MT_ENGINE,
    TextTranslationRequest,
)

TRANSLATOR_API_VERSION = "2025-10-01-preview"
TRANSLATOR_PATH = "/translator/text/translate"
LANGUAGE_API_VERSION = "2026-05-01"
LANGUAGE_PATH = "/language/:analyze-text"
REQUEST_TIMEOUT_SECONDS = 30

logger = logging.getLogger(__name__)
_http_session_local = threading.local()


@dataclass(frozen=True)
class TextTranslatorSettings:
    endpoint: str | None
    subscription_key: str | None
    api_version: str = TRANSLATOR_API_VERSION
    language_api_version: str = LANGUAGE_API_VERSION

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
        language_api_version=first_env(
            "FOUNDRY_LANGUAGE_API_VERSION",
            "AZURE_LANGUAGE_API_VERSION",
            default=LANGUAGE_API_VERSION,
        )
        or LANGUAGE_API_VERSION,
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


def _language_url(settings: TextTranslatorSettings) -> str:
    endpoint = (settings.endpoint or "").rstrip("/")
    query = urlencode({"api-version": settings.language_api_version})
    return f"{endpoint}{LANGUAGE_PATH}?{query}"


def post_translator_json(
    url: str,
    headers: Mapping[str, str],
    body: dict[str, Any],
) -> dict[str, Any]:
    operation = "Azure Language analysis" if LANGUAGE_PATH in url else "Text translation"
    session = getattr(_http_session_local, "session", None)
    if session is None:
        session = requests.Session()
        _http_session_local.session = session
    try:
        response = session.post(
            url,
            headers=dict(headers),
            json=body,
            timeout=REQUEST_TIMEOUT_SECONDS,
            allow_redirects=False,
        )
    except requests.RequestException as exc:
        raise ExternalServiceError(operation) from exc
    if not 200 <= response.status_code < 300:
        raise TranslatorHttpError(
            response.status_code,
            response.text[:2_000],
        )
    try:
        parsed = response.json()
    except json.JSONDecodeError as exc:
        raise ExternalServiceError(operation) from exc
    if not isinstance(parsed, dict):
        raise ExternalServiceError(operation)
    return parsed


def _build_translator_body(request: TextTranslationRequest) -> dict[str, Any]:
    item: dict[str, Any] = {
        "Text": request.text,
        "targets": [{"language": request.target_language}],
    }
    if request.source_language:
        item["language"] = request.source_language
    return {"inputs": [item]}


def _build_language_body(request: TextTranslationRequest) -> dict[str, Any]:
    if request.mode in {"translator_document", "pii_document"}:
        raise InvalidRequestError(
            "Document modes require a document upload and are not supported by the text composer."
        )

    kind_by_mode = {
        "language_detection_text": "LanguageDetection",
        "pii_text": "PiiEntityRecognition",
        "pii_conversation": "PiiEntityRecognition",
        "health_text": "Healthcare",
    }
    kind = kind_by_mode.get(request.mode)
    if kind is None:
        raise InvalidRequestError(f"Unsupported language-service mode: {request.mode}.")

    document: dict[str, str] = {"id": "1", "text": request.text}
    if request.source_language:
        document["language"] = request.source_language
    return {
        "kind": kind,
        "parameters": {
            "modelVersion": "latest",
        },
        "analysisInput": {"documents": [document]},
    }


def _detected_language(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        language = value.get("language") or value.get("Language")
        return language if isinstance(language, str) and language else None
    return None


def _detected_confidence(value: Any) -> float | None:
    if not isinstance(value, dict):
        return None
    confidence = value.get("score") or value.get("confidenceScore")
    return float(confidence) if isinstance(confidence, int | float) else None


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
        "detected_confidence": _detected_confidence(
            first.get("detectedLanguage") or first.get("detected_language")
        ),
        "target_language": selected["language"],
        "translated_text": selected["text"],
        "translations": translations,
        "engine": AZURE_MT_ENGINE,
        "mode": request.mode,
    }


def _language_result(
    request: TextTranslationRequest,
    *,
    text: str,
    target_language: str,
    analysis: dict[str, Any],
    detected_language: str | None = None,
) -> dict[str, Any]:
    return {
        "source_language": request.source_language,
        "detected_language": detected_language,
        "detected_confidence": None,
        "target_language": target_language,
        "translated_text": text,
        "translations": [{"language": target_language, "text": text}],
        "engine": "azure-language",
        "mode": request.mode,
        "analysis": analysis,
    }


def _parse_language_response(
    payload: dict[str, Any],
    *,
    request: TextTranslationRequest,
) -> dict[str, Any]:
    results = payload.get("results")
    documents = results.get("documents") if isinstance(results, dict) else None
    if not isinstance(documents, list) or not documents or not isinstance(documents[0], dict):
        raise ExternalServiceError("Azure Language analysis")
    document = documents[0]

    if request.mode == "language_detection_text":
        detected = document.get("detectedLanguage")
        if not isinstance(detected, dict):
            raise ExternalServiceError("Azure Language analysis")
        code = detected.get("iso6391Name") or detected.get("language")
        name = detected.get("name") or code
        confidence = detected.get("confidenceScore")
        if not isinstance(code, str) or not code:
            raise ExternalServiceError("Azure Language analysis")
        label = str(name) if isinstance(name, str) else code
        if isinstance(confidence, int | float):
            label = f"{label} ({code}, confidence {confidence:.2f})"
        return _language_result(
            request,
            text=label,
            target_language=code,
            detected_language=code,
            analysis={"detected_language": detected},
        )

    if request.mode in {"pii_text", "pii_conversation"}:
        redacted_text = document.get("redactedText")
        if not isinstance(redacted_text, str):
            raise ExternalServiceError("Azure Language analysis")
        entities = document.get("entities")
        return _language_result(
            request,
            text=redacted_text,
            target_language="redacted",
            analysis={"entities": entities if isinstance(entities, list) else []},
        )

    entities = document.get("entities")
    relations = document.get("relations")
    entity_lines: list[str] = []
    if isinstance(entities, list):
        for entity in entities:
            if not isinstance(entity, dict):
                continue
            entity_text = entity.get("text")
            category = entity.get("category")
            if isinstance(entity_text, str) and isinstance(category, str):
                entity_lines.append(f"- {category}: {entity_text}")
    summary = (
        "Clinical entities:\n" + "\n".join(entity_lines)
        if entity_lines
        else "No clinical entities were identified."
    )
    return _language_result(
        request,
        text=summary,
        target_language="health",
        analysis={
            "entities": entities if isinstance(entities, list) else [],
            "relations": relations if isinstance(relations, list) else [],
        },
    )


async def translate_text_with_llm(
    request: TextTranslationRequest,
    *,
    model: str,
    gateway: Any,
    model_settings: Any,
) -> dict[str, Any]:
    system_prompt = (
        "You are a professional translation engine. Translate the user's text into the "
        "requested target language. Preserve meaning, tone, and formatting. Reply with the "
        "translated text only - no explanations, no quotes, no additional commentary."
    )
    target = request.target_language
    source_note = (
        f"Source language: {request.source_language}."
        if request.source_language
        else "Detect the source language automatically."
    )
    prompt = (
        f"{source_note} Translate the text below into '{target}'.\n\n"
        f"<text>\n{request.text}\n</text>"
    )
    logger.info(
        "text_translation_llm_started model=%s source=%s target=%s characters=%s",
        model,
        request.source_language or "auto",
        target,
        len(request.text),
    )
    try:
        result = await run_model_call(
            gateway.complete,
            model=model,
            prompt=prompt,
            api_surface=model_settings.api_surface,
            system_prompt=system_prompt,
            temperature=0.2,
            top_p=model_settings.top_p,
            max_tokens=model_settings.max_tokens,
            repetition_penalty=model_settings.repetition_penalty,
            reasoning_effort=None,
            history=[],
        )
    except Exception as exc:
        body = getattr(exc, "body", None)
        error = body.get("error", body) if isinstance(body, dict) else {}
        code = str(error.get("code", "")) if isinstance(error, dict) else ""
        message = str(error.get("message", "")) if isinstance(error, dict) else ""
        if code == "PermissionDenied" or "lacks the required data action" in message:
            raise ServiceAuthorizationError(
                "The application identity lacks the Cognitive Services OpenAI User role "
                "on the configured Foundry resource."
            ) from exc
        if "does not match resource tenant" in message:
            raise ServiceAuthorizationError(
                "The Azure credential tenant does not match the configured Foundry resource."
            ) from exc
        raise ExternalServiceError("Text translation") from exc

    translated_text = str(result.get("content", "")).strip()
    if not translated_text:
        raise ExternalServiceError("Text translation")
    logger.info(
        "text_translation_llm_completed model=%s target=%s translated_characters=%s",
        model,
        target,
        len(translated_text),
    )
    return {
        "source_language": request.source_language,
        "detected_language": None,
        "detected_confidence": None,
        "target_language": target,
        "translated_text": translated_text,
        "translations": [{"language": target, "text": translated_text}],
        "engine": model,
        "foundry_requests": [result["foundry_request"]] if result.get("foundry_request") else [],
        "foundry_responses": [result["foundry_response"]]
        if result.get("foundry_response")
        else [],
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


async def analyze_text(
    request: TextTranslationRequest,
    *,
    settings: TextTranslatorSettings | None = None,
    post_json: PostJson | None = None,
    token_provider: TokenProvider | None = None,
) -> dict[str, Any]:
    analyzer_settings = settings or load_text_translator_settings()
    if not analyzer_settings.is_configured:
        raise InvalidRequestError(
            "Azure Language is not configured. Set FOUNDRY_PROJECT_ENDPOINT or "
            "FOUNDRY_TRANSLATOR_ENDPOINT."
        )

    headers = _translator_headers(analyzer_settings, token_provider)
    body = _build_language_body(request)
    url = _language_url(analyzer_settings)
    logger.info(
        "language_analysis_started mode=%s characters=%s",
        request.mode,
        len(request.text),
    )
    try:
        response = await asyncio.to_thread(
            post_json or post_translator_json,
            url,
            headers,
            body,
        )
    except TranslatorHttpError as exc:
        if exc.status_code in {401, 403}:
            raise ServiceAuthorizationError(
                "Azure Language rejected the configured key or Entra credential."
            ) from exc
        if exc.status_code == 400:
            raise InvalidRequestError(
                "Azure Language rejected the text or analysis mode."
            ) from exc
        logger.warning(
            "language_analysis_http_failed mode=%s status=%s body=%s",
            request.mode,
            exc.status_code,
            exc.body[:500],
        )
        raise ExternalServiceError("Azure Language analysis") from exc

    result = _parse_language_response(response, request=request)
    logger.info(
        "language_analysis_completed mode=%s characters=%s",
        request.mode,
        len(result["translated_text"]),
    )
    return result
