from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from openai import PermissionDeniedError

from app.features.agent_research.service import stream_agent_research


async def _events(question: str) -> list[dict]:
    return [event async for event in stream_agent_research(question)]


@pytest.mark.anyio
async def test_stream_invokes_published_agent_reference():
    citation = SimpleNamespace(url="https://example.com", title="Example")
    completed_response = SimpleNamespace(
        output=[SimpleNamespace(content=[SimpleNamespace(annotations=[citation])])]
    )
    stream = [
        SimpleNamespace(type="response.output_text.delta", delta="Hello"),
        SimpleNamespace(type="response.completed", response=completed_response),
    ]
    openai_client = MagicMock()
    openai_client.responses.create.return_value = stream
    project_client = MagicMock()
    project_client.get_openai_client.return_value = openai_client
    settings = SimpleNamespace(
        endpoint="https://example.services.ai.azure.com/api/projects/demo",
        is_agent_research_configured=True,
    )

    with (
        patch("app.features.agent_research.service.load_settings", return_value=settings),
        patch("app.features.agent_research.service.get_azure_credential"),
        patch("app.features.agent_research.service.AIProjectClient", return_value=project_client),
    ):
        events = await _events("Question")

    openai_client.responses.create.assert_called_once_with(
        input="Question",
        extra_body={
            "agent_reference": {
                "name": "ResearchAgent",
                "type": "agent_reference",
            }
        },
        stream=True,
    )
    assert {"type": "delta", "delta": "Hello"} in events
    assert events[-1] == {
        "type": "completed",
        "answer": "Hello",
        "citations": [{"title": "Example", "url": "https://example.com"}],
    }


@pytest.mark.anyio
async def test_stream_surfaces_agent_permission_error():
    response = MagicMock(status_code=403, headers={})
    openai_client = MagicMock()
    openai_client.responses.create.side_effect = PermissionDeniedError(
        "Forbidden",
        response=response,
        body=None,
    )
    project_client = MagicMock()
    project_client.get_openai_client.return_value = openai_client
    settings = SimpleNamespace(
        endpoint="https://example.services.ai.azure.com/api/projects/demo",
        is_agent_research_configured=True,
    )

    with (
        patch("app.features.agent_research.service.load_settings", return_value=settings),
        patch("app.features.agent_research.service.get_azure_credential"),
        patch("app.features.agent_research.service.AIProjectClient", return_value=project_client),
    ):
        events = await _events("Question")

    assert events[-1]["type"] == "error"
    assert "Foundry User role" in events[-1]["error"]
