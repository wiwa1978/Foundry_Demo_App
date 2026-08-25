from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import create_app


def test_content_extractor_samples_are_listed_by_mode(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    samples = [
        {
            "id": "invoice.pdf",
            "name": "Sample Invoice",
            "description": "Invoice fixture",
            "sample_url": "/api/content-extractor/samples/document/invoice.pdf",
        }
    ]
    with patch(
        "usecases_media.content_extractor.backend.router.list_samples",
        return_value=samples,
    ):
        response = TestClient(create_app()).get(
            "/api/content-extractor/samples/document"
        )

    assert response.status_code == 200
    assert response.json() == samples


def test_content_extractor_sample_content_is_proxied(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    with patch(
        "usecases_media.content_extractor.backend.router.download_sample",
        return_value=(b"audio", "audio/wav"),
    ):
        response = TestClient(create_app()).get(
            "/api/content-extractor/samples/audio/call.wav"
        )

    assert response.status_code == 200
    assert response.content == b"audio"
    assert response.headers["content-type"] == "audio/wav"


def test_content_extractor_samples_reject_image_mode(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    response = TestClient(create_app()).get(
        "/api/content-extractor/samples/image"
    )

    assert response.status_code == 400
    assert "document or audio" in response.json()["detail"]
