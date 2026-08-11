from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch


def test_trace_query_returns_bounded_safe_span_metadata():
    from usecases_agents.research_assistant_prompt.backend.tracing import (
        get_agent_research_trace,
    )

    table = SimpleNamespace(
        columns=[
            SimpleNamespace(name=name)
            for name in (
                "timestamp",
                "name",
                "duration",
                "success",
                "operation",
                "model",
                "inputTokens",
                "outputTokens",
                "toolName",
                "errorType",
                "operation_Id",
                "id",
                "operation_ParentId",
            )
        ],
        rows=[
            [
                "2026-08-11T10:00:00Z",
                "execute_tool bing_grounding",
                timedelta(milliseconds=125),
                True,
                "execute_tool",
                "gpt-5",
                12,
                8,
                "bing_grounding",
                "",
                "trace-1",
                "span-1",
                None,
            ]
        ],
    )
    query_result = SimpleNamespace(status="Success", tables=[table])
    query_client = MagicMock()
    query_client.query_resource.return_value = query_result
    settings = SimpleNamespace(
        application_insights_resource_id=(
            "/subscriptions/sub/resourceGroups/rg/providers/"
            "Microsoft.Insights/components/foundry-ai"
        )
    )

    with (
        patch(
            "usecases_agents.research_assistant_prompt.backend.tracing.load_settings",
            return_value=settings,
        ),
        patch(
            "usecases_agents.research_assistant_prompt.backend.tracing.get_azure_credential"
        ),
        patch(
            "usecases_agents.research_assistant_prompt.backend.tracing.LogsQueryClient",
            return_value=query_client,
        ),
    ):
        result = get_agent_research_trace("resp_test123")

    assert result.status == "ready"
    assert result.spans[0].tool_name == "bing_grounding"
    assert result.spans[0].duration_ms == 125
    resource_id, query = query_client.query_resource.call_args.args
    assert resource_id == settings.application_insights_resource_id
    assert 'gen_ai.response.id"] == "resp_test123"' in query
    assert "tool.call.arguments" not in query
    assert "tool.call.result" not in query
