from datetime import timedelta
from typing import Any

from azure.monitor.query import LogsQueryClient, LogsQueryStatus

from app.azure_credential import get_azure_credential
from app.features.agent_research.schemas import (
    AgentResearchTraceResponse,
    AgentResearchTraceSpan,
)
from app.providers.settings import load_settings

TRACE_LOOKBACK = timedelta(hours=1)
MAX_TRACE_SPANS = 100


def get_agent_research_trace(response_id: str) -> AgentResearchTraceResponse:
    resource_id = load_settings().application_insights_resource_id
    if not resource_id:
        raise RuntimeError(
            "Research Agent tracing is not configured. Set "
            "FOUNDRY_APPLICATION_INSIGHTS_RESOURCE_ID."
        )

    query = _trace_query(response_id)
    result = LogsQueryClient(get_azure_credential()).query_resource(
        resource_id,
        query,
        timespan=TRACE_LOOKBACK,
    )
    tables = result.tables if result.status == LogsQueryStatus.SUCCESS else result.partial_data
    spans = _spans_from_tables(tables)
    return AgentResearchTraceResponse(
        response_id=response_id,
        status="ready" if spans else "pending",
        spans=spans,
    )


def _trace_query(response_id: str) -> str:
    # response_id is validated by the route before it reaches this KQL literal.
    return f"""
let matchingOperations = materialize(
    dependencies
    | where customDimensions["gen_ai.response.id"] == "{response_id}"
    | distinct operation_Id
);
dependencies
| where operation_Id in (matchingOperations)
| where isnotempty(customDimensions["gen_ai.operation.name"])
| project timestamp, name, duration, success,
    operation=tostring(customDimensions["gen_ai.operation.name"]),
    model=tostring(customDimensions["gen_ai.request.model"]),
    inputTokens=toint(customDimensions["gen_ai.usage.input_tokens"]),
    outputTokens=toint(customDimensions["gen_ai.usage.output_tokens"]),
    toolName=tostring(customDimensions["gen_ai.tool.name"]),
    errorType=tostring(customDimensions["error.type"]),
    operation_Id, id, operation_ParentId
| order by timestamp asc
| take {MAX_TRACE_SPANS}
""".strip()


def _spans_from_tables(tables: list[Any]) -> list[AgentResearchTraceSpan]:
    spans: list[AgentResearchTraceSpan] = []
    for table in tables:
        column_names = [getattr(column, "name", column) for column in table.columns]
        for row in table.rows:
            values = dict(zip(column_names, row, strict=False))
            spans.append(
                AgentResearchTraceSpan(
                    timestamp=_text(values.get("timestamp")),
                    name=_text(values.get("name")),
                    duration_ms=_duration_ms(values.get("duration")),
                    success=values.get("success"),
                    operation=_optional_text(values.get("operation")),
                    model=_optional_text(values.get("model")),
                    input_tokens=values.get("inputTokens"),
                    output_tokens=values.get("outputTokens"),
                    tool_name=_optional_text(values.get("toolName")),
                    error_type=_optional_text(values.get("errorType")),
                    trace_id=_text(values.get("operation_Id")),
                    span_id=_text(values.get("id")),
                    parent_span_id=_optional_text(values.get("operation_ParentId")),
                )
            )
    return spans[:MAX_TRACE_SPANS]


def _duration_ms(value: Any) -> float:
    if hasattr(value, "total_seconds"):
        return round(value.total_seconds() * 1000, 2)
    if isinstance(value, int | float):
        return round(float(value), 2)
    return 0


def _text(value: Any) -> str:
    return "" if value is None else str(value)


def _optional_text(value: Any) -> str | None:
    text = _text(value).strip()
    return text or None
