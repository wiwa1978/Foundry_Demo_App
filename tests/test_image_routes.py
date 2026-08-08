from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import create_app
from app.providers.images import ImagePromptRejectedError


def test_image_generation_contract(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    result = {
        "model": "image",
        "image_base64": "data",
        "mime_type": "image/png",
        "width": 1024,
        "height": 1024,
        "duration_ms": 10,
    }
    with patch("app.features.images.router.get_model_settings") as settings:
        settings.return_value.modalities = ("image",)
        with patch("app.features.images.router.generate_image", return_value=result):
            response = TestClient(create_app()).post(
                "/api/images/generate",
                json={"model": "image", "prompt": "fox", "width": 1024, "height": 1024},
            )
    assert response.status_code == 200
    assert response.json() == result


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


def test_image_prompt_policy_rejection_is_actionable(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    with patch("app.features.images.router.get_model_settings") as settings:
        settings.return_value.modalities = ("image",)
        with patch(
            "app.features.images.router.generate_image",
            side_effect=ImagePromptRejectedError(
                "The image provider rejected this prompt under its content policy. "
                "Revise the prompt and try again."
            ),
        ):
            response = TestClient(create_app(), raise_server_exceptions=False).post(
                "/api/images/generate",
                json={"model": "image", "prompt": "fox", "width": 1024, "height": 1024},
            )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "The image provider rejected this prompt under its content policy. "
        "Revise the prompt and try again.",
        "code": "invalid_request",
    }
