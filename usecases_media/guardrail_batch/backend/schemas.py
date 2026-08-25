from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.api.schemas import MAX_MODEL_NAME_LENGTH, InternalRequestModel
from app.application.guardrail_batch import (
    MAX_STATEMENT_LENGTH,
    MAX_STATEMENTS,
    normalize_statements,
)


class GuardrailBatchRequest(InternalRequestModel):
    model: str = Field(min_length=1, max_length=MAX_MODEL_NAME_LENGTH)
    statements: list[str] = Field(min_length=1, max_length=MAX_STATEMENTS)
    concurrency: int = Field(default=4, ge=1, le=8)

    @field_validator("model")
    @classmethod
    def trim_model(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Model cannot be blank.")
        return value

    @field_validator("statements")
    @classmethod
    def clean_statements(cls, value: list[str]) -> list[str]:
        statements = normalize_statements(value)
        if not statements:
            raise ValueError("Provide at least one non-empty statement.")
        if any(len(statement) > MAX_STATEMENT_LENGTH for statement in statements):
            raise ValueError(f"Statements cannot exceed {MAX_STATEMENT_LENGTH} characters.")
        return statements


class GuardrailBatchPolicyResult(BaseModel):
    policy_name: str
    outcome: Literal["blocked", "flagged", "allowed", "error"]
    blocked: bool
    triggered_filters: list[str]
    response: str
    response_preview: str
    message: str
    duration_ms: int | None = None
    guardrail_results: dict[str, Any] | None = None


class GuardrailBatchStatementResult(BaseModel):
    index: int
    statement: str
    results: list[GuardrailBatchPolicyResult]
