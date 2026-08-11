from typing import Literal

from pydantic import BaseModel, Field, field_validator


class AgentResearchRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)

    @field_validator("question")
    @classmethod
    def normalize_question(cls, value: str) -> str:
        question = value.strip()
        if not question:
            raise ValueError("Question cannot be blank.")
        return question


class AgentResearchCitation(BaseModel):
    title: str | None = None
    url: str


class AgentResearchStartEvent(BaseModel):
    type: Literal["start"] = "start"
    question: str
    agent_name: str
    project_endpoint: str | None
    tracing_enabled: bool = False


class AgentResearchStepEvent(BaseModel):
    type: Literal["step"] = "step"
    label: str
    status: Literal["running", "done", "error"]
    detail: str | None = None


class AgentResearchDeltaEvent(BaseModel):
    type: Literal["delta"] = "delta"
    delta: str


class AgentResearchCitationEvent(BaseModel):
    type: Literal["citation"] = "citation"
    citation: AgentResearchCitation


class AgentResearchCompletedEvent(BaseModel):
    type: Literal["completed"] = "completed"
    answer: str
    citations: list[AgentResearchCitation] = []
    response_id: str | None = None
    tracing_enabled: bool = False


class AgentResearchErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    error: str


class AgentResearchTraceSpan(BaseModel):
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


class AgentResearchTraceResponse(BaseModel):
    response_id: str
    status: Literal["pending", "ready"]
    spans: list[AgentResearchTraceSpan]
