import asyncio
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import create_app
from usecases_media.content_extractor.backend.service import (
    ContentUnderstandingSettings,
    JsonHttpResponse,
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


def test_content_extractor_rejects_non_image_until_supported(monkeypatch) -> None:
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    response = TestClient(create_app()).post(
        "/api/content-extractor/extract",
        data={"mode": "audio"},
        files={"file": ("clip.wav", b"audio", "audio/wav")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Only image extraction is available in this use case right now."


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

    response = TestClient(create_app()).get("/api/config")

    assert response.status_code == 200
    assert response.json()["is_content_extractor_configured"] is True
