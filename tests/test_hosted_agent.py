from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.features.hosted_agent.service import stream_hosted_agent


@pytest.mark.anyio
async def test_stream_invokes_routed_hosted_agent_endpoint():
    stream = [SimpleNamespace(type="response.output_text.delta", delta="Hello")]
    openai_client = MagicMock()
    openai_client.responses.create.return_value = stream
    project_client = MagicMock()
    project_client.get_openai_client.return_value = openai_client
    settings = SimpleNamespace(
        endpoint="https://example.services.ai.azure.com/api/projects/demo",
        hosted_agent_name="hosted-assistant",
        is_hosted_agent_configured=True,
    )

    with (
        patch("app.features.hosted_agent.service.load_settings", return_value=settings),
        patch("app.features.hosted_agent.service.get_azure_credential"),
        patch("app.features.hosted_agent.service.AIProjectClient", return_value=project_client),
    ):
        events = [event async for event in stream_hosted_agent("Question")]

    project_client.get_openai_client.assert_called_once_with(
        agent_name="hosted-assistant"
    )
    openai_client.responses.create.assert_called_once_with(
        input="Question", stream=True
    )
    assert events[-1] == {"type": "completed", "answer": "Hello"}
