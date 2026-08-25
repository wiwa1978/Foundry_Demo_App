from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from openai import PermissionDeniedError

from usecases_agents.azure_architect_agent.prompt.backend.service import stream_azure_architect_agent


async def _events(question: str) -> list[dict]:
    return [event async for event in stream_azure_architect_agent(question)]


@pytest.mark.anyio
async def test_stream_invokes_published_agent_reference():
    citation = SimpleNamespace(url="https://example.com", title="Example")
    completed_response = SimpleNamespace(
        id="resp_test123",
        output=[SimpleNamespace(content=[SimpleNamespace(annotations=[citation])])],
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
        is_azure_architect_agent_configured=True,
    )

    with (
        patch(
            "usecases_agents.azure_architect_agent.prompt.backend.service.load_settings",
            return_value=settings,
        ),
        patch("usecases_agents.azure_architect_agent.prompt.backend.service.get_azure_credential"),
        patch(
            "usecases_agents.azure_architect_agent.prompt.backend.service.AIProjectClient",
            return_value=project_client,
        ),
    ):
        events = await _events("Question")

    openai_client.responses.create.assert_called_once_with(
        input="Question",
        extra_body={
            "agent_reference": {
                "name": "azure-architect-prompt",
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
        "response_id": "resp_test123",
        "tracing_enabled": False,
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
        is_azure_architect_agent_configured=True,
    )

    with (
        patch(
            "usecases_agents.azure_architect_agent.prompt.backend.service.load_settings",
            return_value=settings,
        ),
        patch("usecases_agents.azure_architect_agent.prompt.backend.service.get_azure_credential"),
        patch(
            "usecases_agents.azure_architect_agent.prompt.backend.service.AIProjectClient",
            return_value=project_client,
        ),
    ):
        events = await _events("Question")

    assert events[-1]["type"] == "error"
    assert "Foundry User role" in events[-1]["error"]
