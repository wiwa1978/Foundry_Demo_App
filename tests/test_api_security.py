import base64
import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import MAX_PROMPT_LENGTH, app
from app.persistence import reset_repositories
from app.security import auth_mode
from app.sqlite_store import initialize_sqlite_store


client = TestClient(app)


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


def _claim_only_principal() -> str:
    payload = {
        "auth_typ": "aad",
        "claims": [
            {
                "typ": "http://schemas.microsoft.com/identity/claims/objectidentifier",
                "val": "user-1",
            },
            {
                "typ": "http://schemas.microsoft.com/identity/claims/tenantid",
                "val": "tenant-1",
            },
            {
                "typ": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
                "val": "Ada Lovelace",
            },
            {"typ": "preferred_username", "val": "ada@example.com"},
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
    monkeypatch.delenv("APP_AUTH_TENANT_ID", raising=False)
    rejected = client.get(
        "/api/conversations",
        headers={"x-ms-client-principal-id": "spoofed"},
    )
    from app.conversation_store import ConversationPage

    with patch(
        "app.main.list_conversation_page",
        return_value=ConversationPage(conversations=[], next_cursor=None),
    ):
        accepted = client.get(
            "/api/conversations",
            headers={"x-ms-client-principal": _principal()},
        )
    assert rejected.status_code == 401
    assert accepted.status_code == 200


def test_container_apps_mode_accepts_trusted_compact_headers(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "container_apps")
    monkeypatch.setenv("APP_AUTH_TENANT_ID", "tenant-1")
    response = client.get(
        "/api/auth/me",
        headers={
            "x-ms-client-principal-id": "user-1",
            "x-ms-client-principal-name": "user@example.com",
            "x-ms-client-principal-idp": "aad",
        },
    )
    assert response.status_code == 200
    assert response.json() == {
        "authenticated": True,
        "name": "user@example.com",
        "user_id": "user-1",
        "identity_provider": "aad",
        "email": "user@example.com",
        "tenant_id": "tenant-1",
        "entra_auth_enabled": True,
    }


def test_container_apps_mode_reads_identity_from_easy_auth_claims(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "container_apps")
    response = client.get(
        "/api/auth/me",
        headers={"x-ms-client-principal": _claim_only_principal()},
    )
    assert response.status_code == 200
    assert response.json() == {
        "authenticated": True,
        "name": "Ada Lovelace",
        "user_id": "user-1",
        "identity_provider": "aad",
        "email": "ada@example.com",
        "tenant_id": "tenant-1",
        "entra_auth_enabled": True,
    }


def test_conversations_are_isolated_between_authenticated_users(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_AUTH_MODE", "container_apps")
    monkeypatch.setenv("PERSISTENCE_BACKEND", "sqlite")
    monkeypatch.setenv("SQLITE_DATABASE_PATH", str(tmp_path / "isolation.sqlite3"))
    reset_repositories()
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
    assert other_list.json() == {"conversations": [], "next_cursor": None}
    reset_repositories()


def test_invalid_auth_mode_fails_configuration(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "invalid")
    with pytest.raises(RuntimeError, match="APP_AUTH_MODE"):
        auth_mode()


def test_prompt_length_is_bounded(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    response = client.post(
        "/api/chat",
        json={"model": "gpt-test", "prompt": "x" * (MAX_PROMPT_LENGTH + 1)},
    )
    assert response.status_code == 422


def test_audio_upload_is_bounded(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    monkeypatch.setattr("app.features.voice.router.MAX_AUDIO_BYTES", 4)
    response = client.post(
        "/api/transcriptions",
        data={"model": "transcribe-test"},
        files={"audio": ("recording.wav", b"xxxxx", "audio/wav")},
    )
    assert response.status_code == 413


def test_websocket_rejects_cross_origin_before_connecting(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            "/api/voice-live",
            headers={"origin": "https://attacker.example"},
        ):
            pass
    assert exc_info.value.code == 1008
