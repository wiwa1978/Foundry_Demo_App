from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import create_app


def test_image_generation_contract(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    result = {"model": "image", "image_base64": "data", "mime_type": "image/png"}
    with patch("app.features.images.router.get_model_settings") as settings:
        settings.return_value.modalities = ("image",)
        with patch("app.features.images.router.generate_image", return_value=result):
            response = TestClient(create_app()).post(
                "/api/images/generate",
                json={"model": "image", "prompt": "fox", "width": 1024, "height": 1024},
            )
    assert response.status_code == 200
    assert response.json()["image_base64"] == "data"


def test_image_provider_error_is_sanitized(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    with patch("app.features.images.router.get_model_settings") as settings:
        settings.return_value.modalities = ("image",)
        with patch("app.features.images.router.generate_image", side_effect=RuntimeError("secret")):
            response = TestClient(create_app(), raise_server_exceptions=False).post(
                "/api/images/generate",
                json={"model": "image", "prompt": "fox", "width": 1024, "height": 1024},
            )
    assert response.status_code == 502
    assert "secret" not in response.text
