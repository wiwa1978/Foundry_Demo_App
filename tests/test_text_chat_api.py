import json
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.infrastructure.persistence.registry import reset_repositories
from app.main import create_app


def _events(response) -> list[dict]:
    return [
        json.loads(line.removeprefix("data: "))
        for line in response.text.splitlines()
        if line.startswith("data: ")
    ]


def test_text_chat_stream_contract_and_persistence(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    monkeypatch.setenv("PERSISTENCE_BACKEND", "sqlite")
    monkeypatch.setenv("SQLITE_DATABASE_PATH", str(tmp_path / "chat.sqlite3"))
    reset_repositories()
    provider_events = iter(
        [
            {"type": "foundry_request", "request": {"api_surface": "responses"}},
            {"type": "delta", "delta": "Hello"},
            {"type": "delta", "delta": " there"},
            {
                "type": "completed",
                "content": "Hello there",
                "duration_ms": 25,
                "usage": {"prompt_tokens": 2, "completion_tokens": 2, "total_tokens": 4},
                "guardrail_results": None,
            },
        ]
    )
    with patch(
        "app.infrastructure.azure.foundry.gateway.DefaultFoundryChatGateway.stream",
        return_value=provider_events,
    ):
        with TestClient(create_app()) as client:
            response = client.post(
                "/api/chat/stream",
                json={"model": "gpt-test", "prompt": "Hello"},
            )

    events = _events(response)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert [event["type"] for event in events] == [
        "start",
        "foundry_request",
        "delta",
        "delta",
        "completed",
    ]
    assert events[-1]["assistant_message"]["content"] == "Hello there"
    reset_repositories()


def test_text_chat_stream_failure_is_sanitized(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    monkeypatch.setenv("PERSISTENCE_BACKEND", "sqlite")
    monkeypatch.setenv("SQLITE_DATABASE_PATH", str(tmp_path / "chat-error.sqlite3"))
    reset_repositories()

    def fail_stream(**_kwargs):
        raise RuntimeError("provider secret")
        yield

    with patch(
        "app.infrastructure.azure.foundry.gateway.DefaultFoundryChatGateway.stream",
        side_effect=fail_stream,
    ):
        with TestClient(create_app()) as client:
            response = client.post(
                "/api/chat/stream",
                json={"model": "gpt-test", "prompt": "Hello"},
            )

    events = _events(response)
    assert response.status_code == 200
    assert events[-1]["type"] == "error"
    assert events[-1]["error"] == "Model stream failed. Try again later."
    assert "provider secret" not in response.text
    reset_repositories()


def test_text_chat_non_streaming_keeps_flattened_result(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    monkeypatch.setenv("PERSISTENCE_BACKEND", "sqlite")
    monkeypatch.setenv("SQLITE_DATABASE_PATH", str(tmp_path / "chat-complete.sqlite3"))
    reset_repositories()
    result = {
        "model": "gpt-test",
        "api_surface": "responses",
        "content": "Hello",
        "duration_ms": 10,
        "usage": {"total_tokens": 2},
        "guardrail_results": None,
        "foundry_request": {},
        "foundry_response": {},
    }
    with patch(
        "app.infrastructure.azure.foundry.gateway.DefaultFoundryChatGateway.build_request_trace",
        return_value={},
    ):
        with patch(
            "app.infrastructure.azure.foundry.gateway.DefaultFoundryChatGateway.complete",
            return_value=result,
        ):
            with TestClient(create_app()) as client:
                response = client.post(
                    "/api/chat",
                    json={"model": "gpt-test", "prompt": "Hello"},
                )

    body = response.json()
    assert response.status_code == 200
    assert body["content"] == "Hello"
    assert body["results"][0]["content"] == "Hello"
    reset_repositories()
