import asyncio
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.infrastructure.azure.foundry.settings import load_settings
from app.main import create_app
from usecases_media.text_translation.backend.schemas import TextTranslationRequest
from usecases_media.text_translation.backend.service import TextTranslatorSettings, translate_text


def test_translate_text_omits_source_language_for_auto_detect() -> None:
    captured: dict = {}

    def post_json(url, headers, body):
        captured["url"] = url
        captured["headers"] = headers
        captured["body"] = body
        return {
            "value": [
                {
                    "detectedLanguage": {"language": "en", "score": 1.0},
                    "translations": [{"language": "es", "text": "El doctor está disponible."}],
                }
            ]
        }

    result = asyncio.run(
        translate_text(
            TextTranslationRequest(
                text="Doctor is available.",
                source_language=None,
                target_language="es",
            ),
            settings=TextTranslatorSettings(
                endpoint="https://translator.example.cognitiveservices.azure.com/",
                subscription_key="test-key",
            ),
            post_json=post_json,
        )
    )

    assert captured["url"] == (
        "https://translator.example.cognitiveservices.azure.com"
        "/translator/text/translate?api-version=2025-10-01-preview"
    )
    assert captured["headers"]["Ocp-Apim-Subscription-Key"] == "test-key"
    assert captured["body"] == {
        "inputs": [
            {
                "Text": "Doctor is available.",
                "targets": [{"language": "es"}],
            }
        ]
    }
    assert result == {
        "source_language": None,
        "detected_language": "en",
        "target_language": "es",
        "translated_text": "El doctor está disponible.",
        "translations": [{"language": "es", "text": "El doctor está disponible."}],
    }


def test_translate_text_uses_entra_token_when_key_is_omitted() -> None:
    captured: dict = {}

    def post_json(_url, headers, _body):
        captured["headers"] = headers
        return {
            "value": [
                {
                    "translations": [
                        {"language": "fr", "text": "Bonjour"},
                    ]
                }
            ]
        }

    result = asyncio.run(
        translate_text(
            TextTranslationRequest(text="Hello", target_language="fr"),
            settings=TextTranslatorSettings(
                endpoint="https://translator.example.cognitiveservices.azure.com",
                subscription_key=None,
            ),
            post_json=post_json,
            token_provider=lambda: "entra-token",
        )
    )

    assert captured["headers"] == {
        "Content-Type": "application/json",
        "Authorization": "Bearer entra-token",
    }
    assert result["translated_text"] == "Bonjour"


def test_translator_endpoint_is_derived_from_project_endpoint(monkeypatch) -> None:
    monkeypatch.setenv(
        "FOUNDRY_PROJECT_ENDPOINT",
        "https://aifoundrydemo66fb.services.ai.azure.com/api/projects/demo",
    )
    for name in (
        "FOUNDRY_TRANSLATOR_ENDPOINT",
        "AZURE_TRANSLATOR_ENDPOINT",
        "AZURE_AI_SERVICES_ENDPOINT",
    ):
        monkeypatch.delenv(name, raising=False)

    assert load_settings().translator_endpoint == (
        "https://aifoundrydemo66fb.cognitiveservices.azure.com"
    )


def test_text_translation_route_returns_translated_text(monkeypatch) -> None:
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    monkeypatch.setenv(
        "FOUNDRY_TRANSLATOR_ENDPOINT",
        "https://translator.example.cognitiveservices.azure.com",
    )
    monkeypatch.setenv("FOUNDRY_TRANSLATOR_KEY", "test-key")

    def post_json(_url, _headers, body):
        assert body["inputs"][0]["language"] == "en"
        return {
            "value": [
                {
                    "translations": [
                        {
                            "language": body["inputs"][0]["targets"][0]["language"],
                            "text": "Bonjour",
                        }
                    ]
                }
            ]
        }

    with patch(
        "usecases_media.text_translation.backend.service.post_translator_json",
        post_json,
    ):
        response = TestClient(create_app()).post(
            "/api/text-translation/translate",
            json={"text": "Hello", "source_language": "en", "target_language": "fr"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "source_language": "en",
        "detected_language": None,
        "target_language": "fr",
        "translated_text": "Bonjour",
        "translations": [{"language": "fr", "text": "Bonjour"}],
    }


def test_text_translation_route_sanitizes_provider_errors(monkeypatch) -> None:
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    with patch(
        "usecases_media.text_translation.backend.router.translate_text",
        side_effect=RuntimeError("secret translator failure"),
    ):
        response = TestClient(create_app(), raise_server_exceptions=False).post(
            "/api/text-translation/translate",
            json={"text": "Hello", "target_language": "es"},
        )

    assert response.status_code == 502
    assert response.json() == {
        "detail": "Text translation failed. Try again later.",
        "code": "external_service_error",
    }


def test_config_reports_text_translation_setup_from_project_endpoint(monkeypatch) -> None:
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    monkeypatch.setenv(
        "FOUNDRY_PROJECT_ENDPOINT",
        "https://translator.example.services.ai.azure.com/api/projects/demo",
    )
    for name in (
        "FOUNDRY_TRANSLATOR_ENDPOINT",
        "AZURE_TRANSLATOR_ENDPOINT",
        "AZURE_AI_SERVICES_ENDPOINT",
        "FOUNDRY_TRANSLATOR_KEY",
        "AZURE_TRANSLATOR_KEY",
        "AZURE_AI_SERVICES_KEY",
        "COGNITIVE_SERVICES_KEY",
    ):
        monkeypatch.delenv(name, raising=False)

    with TestClient(create_app()) as client:
        response = client.get("/api/config")

    assert response.status_code == 200
    assert response.json()["is_text_translation_configured"] is True
