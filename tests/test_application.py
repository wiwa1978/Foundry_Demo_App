import logging
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture(autouse=True)
def isolate_auth_environment(monkeypatch):
    for name in (
        "APP_AUTH_MODE",
        "APP_AUTH_TENANT_ID",
        "ENTRA_LOCAL_CLIENT_ID",
        "ENTRA_LOCAL_CLIENT_SECRET",
        "ENTRA_LOCAL_TENANT_ID",
        "ENTRA_LOCAL_SESSION_SECRET",
        "ENTRA_LOCAL_REDIRECT_URI",
    ):
        monkeypatch.delenv(name, raising=False)


def test_create_app_returns_independent_instances():
    assert create_app() is not create_app()


def test_lifespan_initializes_persistence_once():
    with patch("app.main.initialize_persistence") as initialize:
        with TestClient(create_app()) as client:
            assert client.get("/api/health").status_code == 200
    initialize.assert_called_once_with()


def test_health_and_readiness_contracts(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "container_apps")
    application = create_app()
    with patch("app.main.check_persistence") as check:
        client = TestClient(application)
        health = client.get("/api/health")
        ready = client.get("/api/ready")
        check.side_effect = RuntimeError("secret database detail")
        unavailable = client.get("/api/ready")

    assert health.status_code == 200
    assert health.json() == {"status": "ok"}
    assert ready.status_code == 200
    assert ready.json() == {"status": "ready"}
    assert unavailable.status_code == 503
    assert unavailable.json() == {"status": "not_ready"}
    assert "secret database detail" not in unavailable.text


def test_request_id_is_validated_and_returned(monkeypatch, caplog):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    with caplog.at_level(logging.INFO, logger="app.requests"):
        response = TestClient(create_app()).get(
            "/api/health",
            headers={"x-request-id": "request-123"},
        )

    assert response.headers["x-request-id"] == "request-123"
    assert "request_id=request-123" in caplog.text


def test_unexpected_errors_are_sanitized(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    with patch("app.main.load_settings", side_effect=RuntimeError("internal secret")):
        response = TestClient(create_app(), raise_server_exceptions=False).get("/api/config")

    assert response.status_code == 500
    assert response.json() == {"detail": "An unexpected error occurred."}
    assert "internal secret" not in response.text
    assert response.headers["x-request-id"]


def test_provider_errors_use_consistent_public_contract(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    with patch("app.features.images.router.generate_image", side_effect=RuntimeError("provider secret")):
        with patch("app.features.images.router.get_model_settings") as settings:
            settings.return_value.modalities = ("image",)
            response = TestClient(create_app(), raise_server_exceptions=False).post(
                "/api/images/generate",
                json={"model": "image-model", "prompt": "draw a circle"},
            )

    assert response.status_code == 502
    assert response.json() == {"detail": "Image generation failed. Try again later."}
    assert "provider secret" not in response.text


def test_oversized_document_upload_remains_413(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    monkeypatch.setattr("app.features.document_qa.router.MAX_DOCUMENT_UPLOAD_BYTES", 4)
    response = TestClient(create_app()).post(
        "/api/documents",
        files={"files": ("large.txt", b"xxxxx", "text/plain")},
    )
    assert response.status_code == 413
    assert response.json() == {"detail": "Document upload cannot exceed 50 MB."}
