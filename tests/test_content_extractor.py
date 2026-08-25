import asyncio
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.errors import InvalidRequestError
from app.main import create_app
from usecases_media.content_extractor.backend.service import (
    ContentUnderstandingSettings,
    JsonHttpResponse,
    extract_audio_content,
    extract_document_content,
    extract_image_content,
)


def test_extract_image_content_sends_base64_and_polls_result() -> None:
    captured: dict = {}

    def post_json(url, headers, body):
        captured["url"] = url
        captured["headers"] = headers
        captured["body"] = body
        return JsonHttpResponse(
            status_code=202,
            headers={
                "Operation-Location": (
                    "https://cu.example.cognitiveservices.azure.com/contentunderstanding/"
                    "analyzerResults/op-1?api-version=2025-11-01"
                )
            },
            body={"id": "op-1", "status": "NotStarted"},
        )

    def get_json(url, headers):
        captured["poll_url"] = url
        captured["poll_headers"] = headers
        return JsonHttpResponse(
            status_code=200,
            headers={},
            body={
                "id": "op-1",
                "status": "Succeeded",
                "result": {
                    "warnings": [],
                    "contents": [
                        {
                            "markdown": "A pie chart showing sales by region.",
                            "fields": {
                                "Summary": {
                                    "type": "string",
                                    "valueString": "Sales by region",
                                }
                            },
                        }
                    ],
                },
            },
        )

    result = asyncio.run(
        extract_image_content(
            filename="chart.png",
            mime_type="image/png",
            data=b"image-bytes",
            settings=ContentUnderstandingSettings(
                endpoint="https://cu.example.cognitiveservices.azure.com",
                subscription_key=None,
            ),
            post_json=post_json,
            get_json=get_json,
            token_provider=lambda: "entra-token",
        )
    )

    assert captured["url"] == (
        "https://cu.example.cognitiveservices.azure.com/contentunderstanding/"
        "analyzers/prebuilt-imageSearch:analyze?api-version=2025-11-01"
    )
    assert captured["headers"] == {
        "Content-Type": "application/json",
        "Authorization": "Bearer entra-token",
    }
    assert captured["body"] == {
        "inputs": [
            {
                "name": "chart.png",
                "mimeType": "image/png",
                "data": "aW1hZ2UtYnl0ZXM=",
            }
        ]
    }
    assert captured["poll_headers"] == captured["headers"]
    assert result["operation_id"] == "op-1"
    assert result["extracted_text"] == "A pie chart showing sales by region."
    assert result["fields"] == {
        "Summary": {"type": "string", "valueString": "Sales by region"}
    }


def test_image_reference_markdown_falls_back_to_summary_field() -> None:
    def post_json(_url, _headers, _body):
        return JsonHttpResponse(
            status_code=202,
            headers={
                "Operation-Location": (
                    "https://cu.example.cognitiveservices.azure.com/contentunderstanding/"
                    "analyzerResults/op-1?api-version=2025-11-01"
                )
            },
            body={"id": "op-1", "status": "NotStarted"},
        )

    def get_json(_url, _headers):
        return JsonHttpResponse(
            status_code=200,
            headers={},
            body={
                "id": "op-1",
                "status": "Succeeded",
                "result": {
                    "warnings": [],
                    "contents": [
                        {
                            "markdown": "![image](pages/1)\n",
                            "fields": {
                                "Summary": {
                                    "type": "string",
                                    "valueString": "The image contains a labeled pie chart.",
                                }
                            },
                        }
                    ],
                },
            },
        )

    result = asyncio.run(
        extract_image_content(
            filename="chart.jpg",
            mime_type="image/jpeg",
            data=b"image-bytes",
            settings=ContentUnderstandingSettings(
                endpoint="https://cu.example.cognitiveservices.azure.com",
                subscription_key="test-key",
            ),
            post_json=post_json,
            get_json=get_json,
        )
    )

    assert result["extracted_text"] == "The image contains a labeled pie chart."


def test_extract_document_content_resolves_analyzer_id() -> None:
    captured: dict = {}

    def post_json(url, headers, body):
        captured["url"] = url
        return JsonHttpResponse(
            status_code=202,
            headers={
                "Operation-Location": (
                    "https://cu.example.cognitiveservices.azure.com/contentunderstanding/"
                    "analyzerResults/op-2?api-version=2025-11-01"
                )
            },
            body={"id": "op-2", "status": "NotStarted"},
        )

    def get_json(_url, _headers):
        return JsonHttpResponse(
            status_code=200,
            headers={},
            body={
                "id": "op-2",
                "status": "Succeeded",
                "result": {"warnings": [], "contents": [{"markdown": "# Invoice"}]},
            },
        )

    result = asyncio.run(
        extract_document_content(
            analyzer="invoice",
            filename="invoice.pdf",
            mime_type="application/pdf",
            data=b"pdf-bytes",
            settings=ContentUnderstandingSettings(
                endpoint="https://cu.example.cognitiveservices.azure.com",
                subscription_key="test-key",
            ),
            post_json=post_json,
            get_json=get_json,
        )
    )

    assert captured["url"].endswith("analyzers/prebuilt-invoice:analyze?api-version=2025-11-01")
    assert result["mode"] == "document"
    assert result["analyzer_id"] == "prebuilt-invoice"
    assert result["extracted_text"] == "# Invoice"


def test_extract_document_content_rejects_unknown_analyzer() -> None:
    with pytest.raises(InvalidRequestError):
        asyncio.run(
            extract_document_content(
                analyzer="not-a-real-analyzer",
                filename="doc.pdf",
                mime_type="application/pdf",
                data=b"pdf-bytes",
                settings=ContentUnderstandingSettings(
                    endpoint="https://cu.example.cognitiveservices.azure.com",
                    subscription_key="test-key",
                ),
            )
        )


def test_extract_audio_content_uses_call_center_analyzer() -> None:
    captured: dict = {}

    def post_json(url, headers, body):
        captured["url"] = url
        return JsonHttpResponse(
            status_code=202,
            headers={
                "Operation-Location": (
                    "https://cu.example.cognitiveservices.azure.com/contentunderstanding/"
                    "analyzerResults/op-3?api-version=2025-11-01"
                )
            },
            body={"id": "op-3", "status": "NotStarted"},
        )

    def get_json(_url, _headers):
        return JsonHttpResponse(
            status_code=200,
            headers={},
            body={
                "id": "op-3",
                "status": "Succeeded",
                "result": {
                    "warnings": [],
                    "contents": [{"markdown": "Customer called about billing."}],
                },
            },
        )

    result = asyncio.run(
        extract_audio_content(
            filename="call.wav",
            mime_type="audio/wav",
            data=b"audio-bytes",
            settings=ContentUnderstandingSettings(
                endpoint="https://cu.example.cognitiveservices.azure.com",
                subscription_key="test-key",
            ),
            post_json=post_json,
            get_json=get_json,
        )
    )

    assert captured["url"].endswith(
        "analyzers/prebuilt-callCenter:analyze?api-version=2025-11-01"
    )
    assert result["mode"] == "audio"
    assert result["analyzer_id"] == "prebuilt-callCenter"


def test_content_extractor_route_returns_image_result(monkeypatch) -> None:
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    payload = {
        "mode": "image",
        "filename": "chart.png",
        "mime_type": "image/png",
        "analyzer_id": "prebuilt-imageSearch",
        "operation_id": "op-1",
        "status": "Succeeded",
        "extracted_text": "A chart with labels.",
        "fields": {},
        "warnings": [],
    }
    with patch(
        "usecases_media.content_extractor.backend.router.extract_image_content",
        return_value=payload,
    ):
        response = TestClient(create_app()).post(
            "/api/content-extractor/extract",
            data={"mode": "image"},
            files={"file": ("chart.png", b"image", "image/png")},
        )

    assert response.status_code == 200
    assert response.json() == payload


def test_content_extractor_route_returns_document_result(monkeypatch) -> None:
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    payload = {
        "mode": "document",
        "filename": "invoice.pdf",
        "mime_type": "application/pdf",
        "analyzer_id": "prebuilt-invoice",
        "operation_id": "op-2",
        "status": "Succeeded",
        "extracted_text": "Invoice total: $100.00",
        "fields": {},
        "warnings": [],
    }
    with patch(
        "usecases_media.content_extractor.backend.router.extract_document_content",
        return_value=payload,
    ) as mocked:
        response = TestClient(create_app()).post(
            "/api/content-extractor/extract",
            data={"mode": "document", "analyzer": "invoice"},
            files={"file": ("invoice.pdf", b"pdf-bytes", "application/pdf")},
        )

    assert response.status_code == 200
    assert response.json() == payload
    assert mocked.call_args.kwargs["analyzer"] == "invoice"


def test_content_extractor_route_returns_audio_result(monkeypatch) -> None:
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    payload = {
        "mode": "audio",
        "filename": "call.wav",
        "mime_type": "audio/wav",
        "analyzer_id": "prebuilt-callCenter",
        "operation_id": "op-3",
        "status": "Succeeded",
        "extracted_text": "Customer called about a billing issue.",
        "fields": {},
        "warnings": [],
    }
    with patch(
        "usecases_media.content_extractor.backend.router.extract_audio_content",
        return_value=payload,
    ):
        response = TestClient(create_app()).post(
            "/api/content-extractor/extract",
            data={"mode": "audio"},
            files={"file": ("call.wav", b"audio-bytes", "audio/wav")},
        )

    assert response.status_code == 200
    assert response.json() == payload


def test_content_extractor_rejects_unknown_document_analyzer(monkeypatch) -> None:
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    response = TestClient(create_app()).post(
        "/api/content-extractor/extract",
        data={"mode": "document", "analyzer": "not-a-real-analyzer"},
        files={"file": ("doc.pdf", b"pdf-bytes", "application/pdf")},
    )

    assert response.status_code == 400
    assert "Unknown document analyzer" in response.json()["detail"]


def test_content_extractor_rejects_unsupported_audio_type(monkeypatch) -> None:
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    response = TestClient(create_app()).post(
        "/api/content-extractor/extract",
        data={"mode": "audio"},
        files={"file": ("clip.txt", b"not-audio", "text/plain")},
    )

    assert response.status_code == 400
    assert "Upload a WAV" in response.json()["detail"]


def test_config_reports_content_extractor_from_project_endpoint(monkeypatch) -> None:
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    monkeypatch.setenv(
        "FOUNDRY_PROJECT_ENDPOINT",
        "https://cu-demo.services.ai.azure.com/api/projects/demo",
    )
    for name in (
        "FOUNDRY_CONTENT_UNDERSTANDING_ENDPOINT",
        "AZURE_CONTENT_UNDERSTANDING_ENDPOINT",
        "AZURE_AI_SERVICES_ENDPOINT",
    ):
        monkeypatch.delenv(name, raising=False)

    with TestClient(create_app()) as client:
        response = client.get("/api/config")

    assert response.status_code == 200
    assert response.json()["is_content_extractor_configured"] is True
