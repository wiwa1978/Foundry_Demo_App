from unittest.mock import patch

from azure.core.exceptions import HttpResponseError
from fastapi.testclient import TestClient

from app.main import create_app


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
    with patch("usecases_media.shared.images.backend.router._list_samples", return_value=samples):
        response = TestClient(create_app()).get("/api/images/samples")

    assert response.status_code == 200
    assert response.json() == samples


def test_image_sample_content_is_proxied(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    with patch("usecases_media.shared.images.backend.router._download_sample", return_value=(b"image", "image/jpeg")):
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
        "usecases_media.shared.images.backend.router._sample_container_client",
        return_value=(service, container),
    ):
        response = TestClient(create_app()).get("/api/images/samples")

    assert response.status_code == 200
    assert response.json() == []
