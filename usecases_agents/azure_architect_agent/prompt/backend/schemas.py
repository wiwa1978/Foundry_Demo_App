from typing import Literal

from pydantic import BaseModel, Field, field_validator


class AzureArchitectAgentRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)

    @field_validator("question")
    @classmethod
    def normalize_question(cls, value: str) -> str:
        question = value.strip()
        if not question:
            raise ValueError("Question cannot be blank.")
        return question


class AzureArchitectAgentCitation(BaseModel):
    title: str | None = None
    url: str


class AzureArchitectAgentStartEvent(BaseModel):
    type: Literal["start"] = "start"
    question: str
    agent_name: str
    project_endpoint: str | None
    tracing_enabled: bool = False


class AzureArchitectAgentStepEvent(BaseModel):
    type: Literal["step"] = "step"
    label: str
    status: Literal["running", "done", "error"]
    detail: str | None = None


class AzureArchitectAgentDeltaEvent(BaseModel):
    type: Literal["delta"] = "delta"
    delta: str


class AzureArchitectAgentCitationEvent(BaseModel):
    type: Literal["citation"] = "citation"
    citation: AzureArchitectAgentCitation


class AzureArchitectAgentCompletedEvent(BaseModel):
    type: Literal["completed"] = "completed"
    answer: str
    citations: list[AzureArchitectAgentCitation] = []
    response_id: str | None = None
    tracing_enabled: bool = False


class AzureArchitectAgentErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    error: str


class AzureArchitectAgentTraceSpan(BaseModel):
    timestamp: str
    name: str
    duration_ms: float
    success: bool | None = None
    operation: str | None = None
    model: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    tool_name: str | None = None
    error_type: str | None = None
    trace_id: str
    span_id: str
    parent_span_id: str | None = None


class AzureArchitectAgentTraceResponse(BaseModel):
    response_id: str
    status: Literal["pending", "ready"]
    spans: list[AzureArchitectAgentTraceSpan]
