import json
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import create_app
from app.persistence import reset_repositories


def _events(response) -> list[dict]:
    return [
        json.loads(line.removeprefix("data: "))
        for line in response.text.splitlines()
        if line.startswith("data: ")
    ]


def test_document_list_contract(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    with patch(
        "app.services.document_qa.document_qa_service.list_documents",
        return_value=[{"id": "doc-1", "filename": "demo.pdf"}],
    ):
        response = TestClient(create_app()).get("/api/documents")
    assert response.status_code == 200
    assert response.json()["documents"][0]["id"] == "doc-1"


def test_document_question_emits_retrieval_and_completion(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    monkeypatch.setenv("PERSISTENCE_BACKEND", "sqlite")
    monkeypatch.setenv("SQLITE_DATABASE_PATH", str(tmp_path / "documents.sqlite3"))
    reset_repositories()
    retrieval = {
        "chunks": [],
        "embedding": {"model": "embedding", "duration_ms": 5, "dimensions": 3},
    }
    provider_events = iter(
        [
            {"type": "delta", "delta": "Grounded answer"},
            {
                "type": "completed",
                "content": "Grounded answer",
                "duration_ms": 10,
                "usage": {"total_tokens": 3},
                "guardrail_results": None,
            },
        ]
    )
    with patch("app.services.document_qa.document_qa_service.gateway.retrieve", return_value=retrieval):
        with patch(
            "app.services.document_qa.document_qa_service.gateway.grounded_prompt",
            return_value="grounded prompt",
        ):
            with patch("app.services.document_qa.bounded_stream_chat", return_value=provider_events):
                with TestClient(create_app()) as client:
                    response = client.post(
                        "/api/documents/ask/stream",
                        json={"model": "gpt-test", "prompt": "Question?"},
                    )
    events = _events(response)
    assert response.status_code == 200
    assert [event["type"] for event in events] == [
        "start",
        "retrieval",
        "delta",
        "completed",
    ]
    assert events[-1]["assistant_message"]["content"] == "Grounded answer"
    reset_repositories()


def test_document_upload_provider_failure_is_sanitized(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    with patch(
        "app.services.document_qa.document_qa_service.add_document",
        side_effect=RuntimeError("storage secret"),
    ):
        response = TestClient(create_app(), raise_server_exceptions=False).post(
            "/api/documents",
            files={"files": ("demo.txt", b"content", "text/plain")},
        )
    assert response.status_code == 502
    assert response.json() == {"detail": "Document upload failed. Try again later."}
    assert "storage secret" not in response.text
