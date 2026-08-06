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
        {"model": "a", "content": "A", "assistant_message": {"id": "a"}},
        {"model": "b", "content": "B", "assistant_message": {"id": "b"}},
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
