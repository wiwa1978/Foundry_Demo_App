from unittest.mock import patch

from fastapi.testclient import TestClient

from app.application.conversations import Conversation
from app.main import app, create_app

client = TestClient(app)


def test_auth_me_returns_public_unauthenticated_contract(monkeypatch):
    for name in (
        "APP_AUTH_MODE",
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


@patch("app.api.features.conversations.router.list_conversation_page")
def test_conversation_list_contract(mock_list_page, monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    from app.application.conversations import ConversationPage

    mock_list_page.return_value = ConversationPage(
        conversations=[
            Conversation(
                id="conversation-1",
                title="Demo",
                use_case="text_chat",
                created_at="2026-01-01T00:00:00+00:00",
                updated_at="2026-01-01T00:00:00+00:00",
            )
        ],
        next_cursor=None,
    )

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
        ],
        "next_cursor": None,
    }
    scope = mock_list_page.call_args.args[0]
    call = mock_list_page.call_args.kwargs
    assert scope.tenant_id == "local-demo"
    assert scope.user_id == "local-demo"
    assert call["use_case"] == "text_chat"
    assert call["limit"] == 50
    assert call["cursor"] is None


def test_unknown_api_route_uses_fastapi_error_contract(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    response = client.get("/api/not-a-route")

    assert response.status_code == 404
    assert response.json() == {
        "detail": "API route not found.",
        "code": "not_found",
    }


def test_invalid_request_error_has_stable_code_and_request_id(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    response = client.get(
        "/api/model-settings",
        params={"model": " "},
        headers={"x-request-id": "contract-request-400"},
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Model deployment name cannot be blank.",
        "code": "invalid_request",
    }
    assert response.headers["x-request-id"] == "contract-request-400"


@patch("app.api.features.conversations.router.get_conversation", return_value=None)
def test_not_found_error_has_stable_code(_mock_get_conversation, monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    response = client.get("/api/conversations/missing")

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Conversation not found.",
        "code": "not_found",
    }


def test_every_json_operation_has_an_explicit_openapi_response_schema():
    schema = create_app().openapi()
    operations = [
        (path, method, operation)
        for path, path_item in schema["paths"].items()
        for method, operation in path_item.items()
        if method in {"get", "post", "put", "patch", "delete"}
    ]
    excluded = {
        ("/", "get"),
        ("/favicon.svg", "get"),
        ("/{full_path}", "get"),
        ("/api/auth/login", "get"),
        ("/api/auth/callback", "get"),
        ("/api/auth/logout", "get"),
        ("/api/agent-research/stream", "post"),
        ("/api/hosted-agent/stream", "post"),
        ("/api/chat/stream", "post"),
        ("/api/compare/stream", "post"),
        ("/api/documents/ask/stream", "post"),
        ("/api/images/samples/{sample_id}", "get"),
    }
    eligible = [
        (path, method, operation)
        for path, method, operation in operations
        if (path, method) not in excluded
    ]

    assert len(operations) == 46
    assert len(eligible) == 34
    for path, method, operation in eligible:
        response = operation["responses"]["200"]
        assert response["content"]["application/json"]["schema"], (method, path)
