import base64
import json
from unittest.mock import patch

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import MAX_AUDIO_BYTES, MAX_PROMPT_LENGTH, app
from app.security import auth_mode
from app.sqlite_store import initialize_sqlite_store


client = TestClient(app)


def _principal(user_id: str = "user-1") -> str:
    payload = {
        "identityProvider": "aad",
        "userId": user_id,
        "userDetails": "user@example.com",
        "claims": [
            {"typ": "preferred_username", "val": "user@example.com"},
            {"typ": "tid", "val": "tenant-1"},
        ],
    }
    return base64.b64encode(json.dumps(payload).encode()).decode()


def test_disabled_mode_ignores_spoofed_proxy_headers(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")

    response = client.get(
        "/api/auth/me",
        headers={
            "x-ms-client-principal-name": "attacker@example.com",
            "x-ms-client-principal-id": "attacker",
        },
    )

    assert response.json() == {"authenticated": False, "entra_auth_enabled": False}


def test_local_mode_does_not_trust_proxy_headers(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "local")
    for name in (
        "ENTRA_LOCAL_CLIENT_ID",
        "ENTRA_LOCAL_CLIENT_SECRET",
        "ENTRA_LOCAL_TENANT_ID",
        "ENTRA_LOCAL_SESSION_SECRET",
        "ENTRA_LOCAL_REDIRECT_URI",
    ):
        monkeypatch.setenv(name, "x" * 32)

    response = client.get(
        "/api/conversations",
        headers={
            "x-ms-client-principal-name": "attacker@example.com",
            "x-ms-client-principal-id": "attacker",
        },
    )

    assert response.status_code == 401


def test_container_apps_mode_requires_encoded_principal(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "container_apps")

    rejected = client.get(
        "/api/conversations",
        headers={"x-ms-client-principal-id": "spoofed"},
    )
    with patch("app.main.list_conversations", return_value=[]):
        accepted = client.get(
            "/api/conversations",
            headers={"x-ms-client-principal": _principal()},
        )

    assert rejected.status_code == 401
    assert accepted.status_code == 200


def test_conversations_are_isolated_between_authenticated_users(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_AUTH_MODE", "container_apps")
    monkeypatch.setenv("PERSISTENCE_BACKEND", "sqlite")
    monkeypatch.setenv("SQLITE_DATABASE_PATH", str(tmp_path / "isolation.sqlite3"))
    initialize_sqlite_store()

    created = client.post(
        "/api/conversations",
        headers={"x-ms-client-principal": _principal("user-1")},
    )
    owner_list = client.get(
        "/api/conversations",
        headers={"x-ms-client-principal": _principal("user-1")},
    )
    other_list = client.get(
        "/api/conversations",
        headers={"x-ms-client-principal": _principal("user-2")},
    )

    assert created.status_code == 200
    assert len(owner_list.json()["conversations"]) == 1
    assert other_list.json() == {"conversations": []}


def test_invalid_auth_mode_fails_configuration(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "invalid")

    try:
        auth_mode()
    except RuntimeError as exc:
        assert "APP_AUTH_MODE" in str(exc)
    else:
        raise AssertionError("Invalid authentication mode was accepted.")


def test_prompt_length_is_bounded(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")

    response = client.post(
        "/api/chat",
        json={"model": "gpt-test", "prompt": "x" * (MAX_PROMPT_LENGTH + 1)},
    )

    assert response.status_code == 422


def test_audio_upload_is_bounded(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")

    response = client.post(
        "/api/transcriptions",
        data={"model": "transcribe-test"},
        files={"audio": ("recording.wav", b"x" * (MAX_AUDIO_BYTES + 1), "audio/wav")},
    )

    assert response.status_code == 413


def test_websocket_rejects_cross_origin_before_connecting(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")

    try:
        with client.websocket_connect(
            "/api/voice-live",
            headers={"origin": "https://attacker.example"},
        ):
            pass
    except WebSocketDisconnect as exc:
        assert exc.code == 1008
    else:
        raise AssertionError("Cross-origin WebSocket connection was accepted.")
