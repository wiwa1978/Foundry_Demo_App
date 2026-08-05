from unittest.mock import patch

from fastapi.testclient import TestClient

from app.conversation_store import Conversation
from app.main import app


client = TestClient(app)


def test_auth_me_returns_public_unauthenticated_contract(monkeypatch):
    for name in (
        "ENTRA_AUTH_ENABLED",
        "ENTRA_LOCAL_CLIENT_ID",
        "ENTRA_LOCAL_CLIENT_SECRET",
        "ENTRA_LOCAL_TENANT_ID",
        "ENTRA_LOCAL_SESSION_SECRET",
        "ENTRA_LOCAL_REDIRECT_URI",
    ):
        monkeypatch.delenv(name, raising=False)

    response = client.get("/api/auth/me")

    assert response.status_code == 200
    assert response.json() == {
        "authenticated": False,
        "entra_auth_enabled": False,
    }


@patch("app.main.list_conversations")
@patch("app.main._is_entra_auth_enabled", return_value=False)
def test_conversation_list_contract(_mock_auth_enabled, mock_list_conversations):
    mock_list_conversations.return_value = [
        Conversation(
            id="conversation-1",
            title="Demo",
            use_case="text_chat",
            created_at="2026-01-01T00:00:00+00:00",
            updated_at="2026-01-01T00:00:00+00:00",
        )
    ]

    response = client.get("/api/conversations", params={"use_case": "text_chat"})

    assert response.status_code == 200
    assert response.json() == {
        "conversations": [
            {
                "id": "conversation-1",
                "title": "Demo",
                "use_case": "text_chat",
                "created_at": "2026-01-01T00:00:00+00:00",
                "updated_at": "2026-01-01T00:00:00+00:00",
            }
        ]
    }
    mock_list_conversations.assert_called_once_with("text_chat")


@patch("app.main._is_entra_auth_enabled", return_value=False)
def test_unknown_api_route_uses_fastapi_error_contract(_mock_auth_enabled):
    response = client.get("/api/not-a-route")

    assert response.status_code == 404
    assert response.json() == {"detail": "API route not found."}
