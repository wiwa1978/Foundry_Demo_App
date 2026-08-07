from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import create_app
from app.persistence import reset_repositories


def test_comparison_returns_one_result_per_model(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    monkeypatch.setenv("PERSISTENCE_BACKEND", "sqlite")
    monkeypatch.setenv("SQLITE_DATABASE_PATH", str(tmp_path / "comparison.sqlite3"))
    reset_repositories()
    sequence = [
        {
            "model": "a",
            "content": "A",
            "assistant_message": {
                "id": "a",
                "conversation_id": "conversation-1",
                "role": "assistant",
                "content": "A",
                "model": "a",
                "api_surface": "responses",
                "duration_ms": 1,
                "error": None,
                "usage": None,
                "guardrail_variant": None,
                "guardrail_policy_name": None,
                "guardrail_results": None,
                "created_at": "2026-01-01T00:00:00+00:00",
            },
        },
        {
            "model": "b",
            "content": "B",
            "assistant_message": {
                "id": "b",
                "conversation_id": "conversation-1",
                "role": "assistant",
                "content": "B",
                "model": "b",
                "api_surface": "responses",
                "duration_ms": 1,
                "error": None,
                "usage": None,
                "guardrail_variant": None,
                "guardrail_policy_name": None,
                "guardrail_results": None,
                "created_at": "2026-01-01T00:00:00+00:00",
            },
        },
    ]
    with patch("app.features.comparison.router.chat_service.run_and_store_variant", side_effect=sequence):
        with TestClient(create_app()) as client:
            response = client.post(
                "/api/compare",
                json={"models": ["a", "b"], "prompt": "Compare"},
            )
    assert response.status_code == 200
    assert [item["content"] for item in response.json()["results"]] == ["A", "B"]
    reset_repositories()


def test_comparison_provider_failure_is_502(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    monkeypatch.setenv("PERSISTENCE_BACKEND", "sqlite")
    monkeypatch.setenv("SQLITE_DATABASE_PATH", str(tmp_path / "comparison-error.sqlite3"))
    reset_repositories()
    with patch(
        "app.features.comparison.router.chat_service.run_and_store_variant",
        return_value={
            "model": "a",
            "error": "Model request failed. Try again later.",
        },
    ):
        with TestClient(create_app(), raise_server_exceptions=False) as client:
            response = client.post(
                "/api/compare",
                json={"models": ["a"], "prompt": "Compare"},
            )

    assert response.status_code == 502
    assert response.json() == {
        "detail": "Model comparison failed. Try again later.",
        "code": "external_service_error",
    }
    assert "provider secret" not in response.text
    reset_repositories()
