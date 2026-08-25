from typing import Literal

from pydantic import BaseModel, Field, field_validator


class InvestmentPlannerRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)

    @field_validator("question")
    @classmethod
    def normalize_question(cls, value: str) -> str:
        question = value.strip()
        if not question:
            raise ValueError("Question cannot be blank.")
        return question


class InvestmentPlannerStartEvent(BaseModel):
    type: Literal["start"] = "start"
    question: str
    agent_name: str
    project_endpoint: str | None


class InvestmentPlannerStepEvent(BaseModel):
    type: Literal["step"] = "step"
    label: str
    status: Literal["running", "done", "error"]
    detail: str | None = None


class InvestmentPlannerDeltaEvent(BaseModel):
    type: Literal["delta"] = "delta"
    delta: str


class InvestmentPlannerCompletedEvent(BaseModel):
    type: Literal["completed"] = "completed"
    answer: str
    response_id: str | None = None


class InvestmentPlannerErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    error: str
