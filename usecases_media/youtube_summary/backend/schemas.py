from typing import Any

from pydantic import Field, field_validator

from app.api.features.shared_schemas import ProviderTrace
from app.api.schemas import (
    MAX_MODEL_NAME_LENGTH,
    InternalRequestModel,
    normalize_reasoning_effort,
)


class YouTubeSummaryRequest(InternalRequestModel):
    url: str = Field(min_length=1, max_length=2_000)
    model: str = Field(min_length=1, max_length=MAX_MODEL_NAME_LENGTH)
    transcription_model: str | None = Field(default=None, max_length=MAX_MODEL_NAME_LENGTH)
    language: str = Field(default="en", min_length=2, max_length=35)
    reasoning_effort: str | None = None

    @field_validator("url", "model", "language")
    @classmethod
    def trim_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value cannot be blank.")
        return value

    @field_validator("transcription_model")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None

    @field_validator("reasoning_effort")
    @classmethod
    def normalize_effort(cls, value: str | None) -> str | None:
        return normalize_reasoning_effort(value)


class YouTubeSummaryResponse(InternalRequestModel):
    video_id: str
    source: str
    language: str
    transcript: str
    summary: str
    model: str
    transcription_model: str | None = None
    duration_ms: int
    usage: dict[str, Any]
    foundry_requests: list[ProviderTrace]
    foundry_responses: list[ProviderTrace]
