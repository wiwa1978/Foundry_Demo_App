import asyncio
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.domain.models import ModelSettings
from app.infrastructure.azure.foundry.settings import load_settings
from app.main import create_app
from usecases_media.text_translation.backend.schemas import TextTranslationRequest
from usecases_media.text_translation.backend.service import (
    TextTranslatorSettings,
    analyze_text,
    translate_text,
    translate_text_with_llm,
)

LLM_MODEL_SETTINGS = ModelSettings(
    model="gpt-5.1",
    api_surface="responses",
    temperature=0.2,
    top_p=1,
    max_tokens=1000,
    repetition_penalty=1,
)


class FakeGateway:
    def __init__(self):
        self.prompts = []

    def complete(self, **kwargs):
        self.prompts.append(kwargs)
        return {
            "content": "Bonjour",
            "usage": {"input_tokens": 5},
            "foundry_request": {"path": "/responses"},
            "foundry_response": {"status": 200},
        }


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
        "engine": "azure-mt",
        "mode": "translator_text",
        "detected_confidence": 1.0,
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
        "engine": "azure-mt",
        "mode": "translator_text",
        "analysis": {},
        "detected_confidence": None,
        "foundry_requests": [],
        "foundry_responses": [],
    }


def test_analyze_text_detects_language() -> None:
    captured: dict = {}

    def post_json(url, _headers, body):
        captured["url"] = url
        captured["body"] = body
        return {
            "results": {
                "documents": [
                    {
                        "detectedLanguage": {
                            "name": "French",
                            "iso6391Name": "fr",
                            "confidenceScore": 0.98,
                        }
                    }
                ]
            }
        }

    result = asyncio.run(
        analyze_text(
            TextTranslationRequest(
                text="Bonjour, comment allez-vous ?",
                target_language="es",
                mode="language_detection_text",
            ),
            settings=TextTranslatorSettings(
                endpoint="https://language.example.cognitiveservices.azure.com",
                subscription_key="test-key",
            ),
            post_json=post_json,
        )
    )

    assert captured["url"].endswith(
        "/language/:analyze-text?api-version=2026-05-01"
    )
    assert captured["body"]["kind"] == "LanguageDetection"
    assert result["detected_language"] == "fr"
    assert result["translated_text"] == "French (fr, confidence 0.98)"


def test_analyze_text_redacts_pii() -> None:
    def post_json(_url, _headers, body):
        assert body["kind"] == "PiiEntityRecognition"
        return {
            "results": {
                "documents": [
                    {
                        "redactedText": "Contact [PERSON] at [EMAIL].",
                        "entities": [
                            {
                                "text": "Maria Jensen",
                                "category": "Person",
                                "confidenceScore": 0.99,
                            }
                        ],
                    }
                ]
            }
        }

    result = asyncio.run(
        analyze_text(
            TextTranslationRequest(
                text="Contact Maria Jensen at maria@example.com.",
                target_language="es",
                mode="pii_text",
            ),
            settings=TextTranslatorSettings(
                endpoint="https://language.example.cognitiveservices.azure.com",
                subscription_key="test-key",
            ),
            post_json=post_json,
        )
    )

    assert result["translated_text"] == "Contact [PERSON] at [EMAIL]."
    assert result["target_language"] == "redacted"
    assert result["analysis"]["entities"][0]["category"] == "Person"


def test_analyze_text_extracts_health_entities() -> None:
    def post_json(_url, _headers, body):
        assert body["kind"] == "Healthcare"
        return {
            "results": {
                "documents": [
                    {
                        "entities": [
                            {
                                "text": "dry cough",
                                "category": "Symptom",
                            }
                        ],
                        "relations": [],
                    }
                ]
            }
        }

    result = asyncio.run(
        analyze_text(
            TextTranslationRequest(
                text="The patient reports a dry cough.",
                target_language="es",
                mode="health_text",
            ),
            settings=TextTranslatorSettings(
                endpoint="https://language.example.cognitiveservices.azure.com",
                subscription_key="test-key",
            ),
            post_json=post_json,
        )
    )

    assert result["translated_text"] == "Clinical entities:\n- Symptom: dry cough"
    assert result["target_language"] == "health"


def test_language_service_route_dispatches_to_azure_language(monkeypatch) -> None:
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")

    async def fake_analyze(request):
        assert request.mode == "language_detection_text"
        return {
            "source_language": None,
            "detected_language": "fr",
            "target_language": "fr",
            "translated_text": "French (fr, confidence 0.98)",
            "translations": [
                {"language": "fr", "text": "French (fr, confidence 0.98)"}
            ],
            "engine": "azure-language",
            "mode": "language_detection_text",
            "analysis": {},
        }

    with patch(
        "usecases_media.text_translation.backend.router.analyze_text",
        side_effect=fake_analyze,
    ) as mock_analyze:
        response = TestClient(create_app()).post(
            "/api/text-translation/translate",
            json={
                "text": "Bonjour",
                "mode": "language_detection_text",
            },
        )

    assert response.status_code == 200
    assert response.json()["engine"] == "azure-language"
    assert response.json()["detected_language"] == "fr"
    mock_analyze.assert_called_once()


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


def test_translate_text_with_llm_uses_chat_model() -> None:
    gateway = FakeGateway()

    result = asyncio.run(
        translate_text_with_llm(
            TextTranslationRequest(
                text="Hello",
                source_language="en",
                target_language="fr",
                model="gpt-5.1",
            ),
            model="gpt-5.1",
            gateway=gateway,
            model_settings=LLM_MODEL_SETTINGS,
        )
    )

    assert len(gateway.prompts) == 1
    call = gateway.prompts[0]
    assert call["model"] == "gpt-5.1"
    assert call["api_surface"] == "responses"
    assert "Source language: en." in call["prompt"]
    assert "'fr'" in call["prompt"]
    assert "Hello" in call["prompt"]

    assert result == {
        "source_language": "en",
        "detected_language": None,
        "target_language": "fr",
        "translated_text": "Bonjour",
        "translations": [{"language": "fr", "text": "Bonjour"}],
        "engine": "gpt-5.1",
        "detected_confidence": None,
        "foundry_requests": [{"path": "/responses"}],
        "foundry_responses": [{"status": 200}],
    }


def test_text_translation_route_uses_llm_when_model_is_not_azure_mt(monkeypatch) -> None:
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")

    with patch(
        "usecases_media.text_translation.backend.router.translate_text_with_llm",
    ) as mock_translate:

        async def fake_translate(*_args, **_kwargs):
            return {
                "source_language": "en",
                "detected_language": None,
                "target_language": "fr",
                "translated_text": "Bonjour",
                "translations": [{"language": "fr", "text": "Bonjour"}],
                "engine": "gpt-5.1",
                "foundry_requests": [],
                "foundry_responses": [],
            }

        mock_translate.side_effect = fake_translate

        response = TestClient(create_app()).post(
            "/api/text-translation/translate",
            json={
                "text": "Hello",
                "source_language": "en",
                "target_language": "fr",
                "model": "gpt-5.1",
            },
        )

    assert response.status_code == 200
    assert response.json()["engine"] == "gpt-5.1"
    assert response.json()["translated_text"] == "Bonjour"
    mock_translate.assert_called_once()
    _, kwargs = mock_translate.call_args
    assert kwargs["model"] == "gpt-5.1"


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
