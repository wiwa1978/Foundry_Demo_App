from typing import Literal

from pydantic import BaseModel, Field, field_validator


class HostedAgentRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    agent_key: str | None = None

    @field_validator("message")
    @classmethod
    def normalize_message(cls, value: str) -> str:
        message = value.strip()
        if not message:
            raise ValueError("Message cannot be blank.")
        return message


class HostedAgentStartEvent(BaseModel):
    type: Literal["start"] = "start"
    message: str
    agent_name: str
    agent_key: str
    project_endpoint: str


class HostedAgentStepEvent(BaseModel):
    type: Literal["step"] = "step"
    label: str
    status: Literal["running", "done", "error"]
    detail: str | None = None


class HostedAgentDeltaEvent(BaseModel):
    type: Literal["delta"] = "delta"
    delta: str


class HostedAgentCompletedEvent(BaseModel):
    type: Literal["completed"] = "completed"
    answer: str


class HostedAgentErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    error: str
