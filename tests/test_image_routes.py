from unittest.mock import patch

from azure.core.exceptions import HttpResponseError
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


def test_image_samples_are_listed_from_private_storage(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    samples = [
        {
            "id": "forest.jpg",
            "name": "Forest",
            "attribution": "Photographer on Unsplash",
            "source_url": "https://unsplash.com/photos/example",
            "image_url": "/api/images/samples/forest.jpg",
        }
    ]
    with patch("app.features.images.router._list_samples", return_value=samples):
        response = TestClient(create_app()).get("/api/images/samples")

    assert response.status_code == 200
    assert response.json() == samples


def test_image_sample_content_is_proxied(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    with patch("app.features.images.router._download_sample", return_value=(b"image", "image/jpeg")):
        response = TestClient(create_app()).get("/api/images/samples/forest.jpg")

    assert response.status_code == 200
    assert response.content == b"image"
    assert response.headers["content-type"] == "image/jpeg"


def test_image_sample_list_degrades_when_storage_is_unavailable(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    monkeypatch.setenv("AZURE_STORAGE_ACCOUNT_URL", "https://storage.example")
    monkeypatch.setenv("AZURE_STORAGE_CONTAINER_NAME", "samples")
    container = type(
        "Container",
        (),
        {"list_blobs": lambda self, **kwargs: (_ for _ in ()).throw(HttpResponseError("denied"))},
    )()
    service = type("Service", (), {"close": lambda self: None})()
    with patch(
        "app.features.images.router._sample_container_client",
        return_value=(service, container),
    ):
        response = TestClient(create_app()).get("/api/images/samples")

    assert response.status_code == 200
    assert response.json() == []
