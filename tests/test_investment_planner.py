from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from usecases_agents.investment_planner_prompt.backend.service import (
    stream_investment_plan,
)

SERVICE = "usecases_agents.investment_planner_prompt.backend.service"


def _settings():
    return SimpleNamespace(
        endpoint="https://example.services.ai.azure.com/api/projects/demo",
        investment_planner_agent_name="investment-planner",
        is_investment_planner_configured=True,
    )


def _project_client(stream):
    openai_client = MagicMock()
    openai_client.responses.create.return_value = stream
    openai_client.conversations.create.return_value = SimpleNamespace(id="conv_1")
    project_client = MagicMock()
    project_client.get_openai_client.return_value = openai_client
    return project_client, openai_client


async def _collect(question="Build my plan"):
    return [event async for event in stream_investment_plan(question)]


@pytest.mark.anyio
async def test_stream_invokes_published_prompt_agent_by_reference():
    stream = [
        SimpleNamespace(type="response.output_text.delta", delta="Plan"),
        SimpleNamespace(
            type="response.completed", response=SimpleNamespace(id="resp_123")
        ),
    ]
    project_client, openai_client = _project_client(stream)

    with (
        patch(f"{SERVICE}.load_settings", return_value=_settings()),
        patch(f"{SERVICE}.get_azure_credential"),
        patch(f"{SERVICE}.AIProjectClient", return_value=project_client),
    ):
        events = await _collect()

    call = openai_client.responses.create.call_args.kwargs
    assert call["conversation"] == "conv_1"
    assert call["stream"] is True
    assert call["extra_body"] == {
        "agent_reference": {"name": "investment-planner", "type": "agent_reference"}
    }
    assert events[-1] == {
        "type": "completed",
        "answer": "Plan",
        "response_id": "resp_123",
    }


@pytest.mark.anyio
async def test_stream_reports_skill_invocations_as_steps():
    function_call = SimpleNamespace(type="function_call", name="blob-reader")
    stream = [
        SimpleNamespace(type="response.output_item.added", item=function_call),
        SimpleNamespace(type="response.output_item.done", item=function_call),
        SimpleNamespace(type="response.output_text.delta", delta="Done"),
        SimpleNamespace(
            type="response.completed", response=SimpleNamespace(id="resp_456")
        ),
    ]
    project_client, _ = _project_client(stream)

    with (
        patch(f"{SERVICE}.load_settings", return_value=_settings()),
        patch(f"{SERVICE}.get_azure_credential"),
        patch(f"{SERVICE}.AIProjectClient", return_value=project_client),
    ):
        events = await _collect()

    skill_steps = [
        event
        for event in events
        if event["type"] == "step" and event["label"] == "Skill: blob-reader"
    ]
    assert [step["status"] for step in skill_steps] == ["running", "done"]


@pytest.mark.anyio
async def test_stream_polls_when_harness_closes_the_stream_early():
    stream = [
        SimpleNamespace(type="response.created", response=SimpleNamespace(id="resp_789")),
    ]
    project_client, openai_client = _project_client(stream)
    openai_client.responses.retrieve.return_value = SimpleNamespace(
        status="completed", output_text="Background plan"
    )

    with (
        patch(f"{SERVICE}.load_settings", return_value=_settings()),
        patch(f"{SERVICE}.get_azure_credential"),
        patch(f"{SERVICE}.AIProjectClient", return_value=project_client),
    ):
        events = await _collect()

    openai_client.responses.retrieve.assert_called_once_with("resp_789")
    assert events[-1] == {
        "type": "completed",
        "answer": "Background plan",
        "response_id": "resp_789",
    }


@pytest.mark.anyio
async def test_stream_requires_configuration():
    settings = SimpleNamespace(
        endpoint=None,
        investment_planner_agent_name=None,
        is_investment_planner_configured=False,
    )
    with (
        patch(f"{SERVICE}.load_settings", return_value=settings),
        pytest.raises(RuntimeError),
    ):
        await _collect()
