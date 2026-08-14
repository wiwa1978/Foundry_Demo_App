from unittest.mock import patch

from azure.core.exceptions import HttpResponseError
from fastapi.testclient import TestClient

from app.infrastructure.azure.foundry.images import ImagePromptRejectedError
from app.infrastructure.persistence.registry import reset_repositories
from app.main import create_app


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
    with patch("app.application.models.ModelService.get") as settings:
        settings.return_value.modalities = ("image",)
        with patch(
            "usecases_media.shared.images.backend.router.generate_image", return_value=result
        ):
            response = TestClient(create_app()).post(
                "/api/images/generate",
                json={"model": "image", "prompt": "fox", "width": 1024, "height": 1024},
            )
    assert response.status_code == 200
    assert response.json() == result


def test_image_generation_persists_when_use_case_is_supplied(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    monkeypatch.setenv("PERSISTENCE_BACKEND", "sqlite")
    monkeypatch.setenv("SQLITE_DATABASE_PATH", str(tmp_path / "images.sqlite3"))
    reset_repositories()
    result = {
        "model": "image",
        "image_base64": "data",
        "mime_type": "image/png",
        "width": 1024,
        "height": 1024,
        "duration_ms": 10,
    }
    with patch("app.application.models.ModelService.get") as settings:
        settings.return_value.modalities = ("image",)
        with patch(
            "usecases_media.shared.images.backend.router.generate_image", return_value=result
        ):
            with TestClient(create_app()) as client:
                response = client.post(
                    "/api/images/generate",
                    json={
                        "model": "image",
                        "prompt": "fox",
                        "width": 1024,
                        "height": 1024,
                        "use_case": "text_to_image",
                    },
                )
                body = response.json()
                conversations = client.get("/api/conversations?use_case=text_to_image").json()
                detail = client.get(
                    f"/api/conversations/{body['conversation']['id']}?use_case=text_to_image"
                ).json()

    assert response.status_code == 200
    assert body["conversation"]["use_case"] == "text_to_image"
    assert body["user_message"]["content"] == "fox"
    assert body["assistant_message"]["model"] == "image"
    assert conversations["conversations"][0]["id"] == body["conversation"]["id"]
    assert [message["role"] for message in detail["messages"]] == ["user", "assistant"]
    assert "image_base64" in detail["messages"][1]["content"]
    reset_repositories()


def test_text_to_image_generation_does_not_store_image_sample_by_default(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    monkeypatch.setenv("AZURE_STORAGE_ACCOUNT_URL", "https://storage.example")
    monkeypatch.setenv("AZURE_STORAGE_CONTAINER_NAME", "samples")
    result = {
        "model": "image",
        "image_base64": "aW1hZ2U=",
        "mime_type": "image/png",
        "width": 1024,
        "height": 1024,
        "duration_ms": 10,
    }

    with patch("app.application.models.ModelService.get") as settings:
        settings.return_value.modalities = ("image",)
        with patch(
            "usecases_media.shared.images.backend.router.generate_image", return_value=result
        ):
            with patch(
                "usecases_media.shared.images.backend.router._sample_container_client"
            ) as sample_container_client:
                response = TestClient(create_app()).post(
                    "/api/images/generate",
                    json={
                        "model": "image",
                        "prompt": "A fox in a forest",
                        "width": 1024,
                        "height": 1024,
                        "use_case": "text_to_image",
                    },
                )

    assert response.status_code == 200
    sample_container_client.assert_not_called()


def test_text_to_image_generation_is_stored_as_image_sample(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    monkeypatch.setenv("AZURE_STORAGE_ACCOUNT_URL", "https://storage.example")
    monkeypatch.setenv("AZURE_STORAGE_CONTAINER_NAME", "samples")

    uploaded: dict = {}

    class BlobContainer:
        def upload_blob(self, name, data, overwrite, metadata, content_settings):
            uploaded["name"] = name
            uploaded["data"] = data
            uploaded["overwrite"] = overwrite
            uploaded["metadata"] = metadata
            uploaded["content_type"] = content_settings.content_type

    class BlobService:
        def close(self):
            uploaded["closed"] = True

    result = {
        "model": "image",
        "image_base64": "aW1hZ2U=",
        "mime_type": "image/png",
        "width": 1024,
        "height": 1024,
        "duration_ms": 10,
    }

    with patch("app.application.models.ModelService.get") as settings:
        settings.return_value.modalities = ("image",)
        with patch(
            "usecases_media.shared.images.backend.router.generate_image", return_value=result
        ):
            with patch(
                "usecases_media.shared.images.backend.router._sample_container_client",
                return_value=(BlobService(), BlobContainer()),
            ):
                response = TestClient(create_app()).post(
                    "/api/images/generate",
                    json={
                        "model": "image",
                        "prompt": "A fox in a forest",
                        "width": 1024,
                        "height": 1024,
                        "use_case": "text_to_image",
                        "save_to_gallery": True,
                    },
                )

    assert response.status_code == 200
    assert uploaded["name"].startswith("image-samples/generated-a-fox-in-a-forest-")
    assert uploaded["name"].endswith(".png")
    assert uploaded["data"] == b"image"
    assert uploaded["overwrite"] is False
    assert uploaded["metadata"] == {
        "title": "A fox in a forest",
        "attribution": "Generated by Text to Image",
        "source_url": "",
    }
    assert uploaded["content_type"] == "image/png"
    assert uploaded["closed"] is True

def test_image_provider_error_is_sanitized(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    with patch("app.application.models.ModelService.get") as settings:
        settings.return_value.modalities = ("image",)
        with patch(
            "usecases_media.shared.images.backend.router.generate_image",
            side_effect=RuntimeError("secret"),
        ):
            response = TestClient(create_app(), raise_server_exceptions=False).post(
                "/api/images/generate",
                json={"model": "image", "prompt": "fox", "width": 1024, "height": 1024},
            )
    assert response.status_code == 502
    assert "secret" not in response.text


def test_image_prompt_policy_rejection_is_actionable(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    with patch("app.application.models.ModelService.get") as settings:
        settings.return_value.modalities = ("image",)
        with patch(
            "usecases_media.shared.images.backend.router.generate_image",
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
    with patch("usecases_media.shared.images.backend.router._list_samples", return_value=samples):
        response = TestClient(create_app()).get("/api/images/samples")

    assert response.status_code == 200
    assert response.json() == samples


def test_image_sample_content_is_proxied(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    with patch(
        "usecases_media.shared.images.backend.router._download_sample",
        return_value=(b"image", "image/jpeg"),
    ):
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
