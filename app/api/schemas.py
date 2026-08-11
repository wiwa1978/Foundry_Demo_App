from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MAX_PROMPT_LENGTH = 20_000
MAX_INSTRUCTIONS_LENGTH = 20_000
MAX_MODEL_NAME_LENGTH = 200
REASONING_EFFORTS = {"none", "minimal", "low", "medium", "high", "xhigh"}


class InternalRequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


def normalize_reasoning_effort(value: str | None) -> str | None:
    if value is None:
        return None
    normalized_value = value.strip().lower()
    if not normalized_value or normalized_value == "default":
        return None
    if normalized_value not in REASONING_EFFORTS:
        raise ValueError(
            "Reasoning effort must be one of: none, minimal, low, medium, high, xhigh."
        )
    return normalized_value


class ChatRequest(InternalRequestModel):
    model: str = Field(min_length=1, max_length=MAX_MODEL_NAME_LENGTH)
    prompt: str = Field(min_length=1, max_length=MAX_PROMPT_LENGTH)
    conversation_id: str | None = None
    reasoning_effort: str | None = None
    guardrail_comparison: bool = False
    use_case: str = "text_chat"

    @field_validator("model", "prompt")
    @classmethod
    def trim_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value cannot be blank.")
        return value

    @field_validator("reasoning_effort")
    @classmethod
    def normalize_effort(cls, value: str | None) -> str | None:
        return normalize_reasoning_effort(value)


class DocumentQuestionRequest(ChatRequest):
    use_case: str = "document_qa"


class CompareRequest(InternalRequestModel):
    models: list[str] = Field(min_length=1, max_length=4)
    prompt: str = Field(min_length=1, max_length=MAX_PROMPT_LENGTH)
    conversation_id: str | None = None
    reasoning_effort: str | None = None
    use_case: str = "comparison"

    @field_validator("models")
    @classmethod
    def normalize_models(cls, value: list[str]) -> list[str]:
        models = list(dict.fromkeys(model.strip() for model in value if model.strip()))
        if not models:
            raise ValueError("Select at least one model.")
        return models

    @field_validator("prompt")
    @classmethod
    def trim_prompt(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Prompt cannot be blank.")
        return value

    @field_validator("reasoning_effort")
    @classmethod
    def normalize_effort(cls, value: str | None) -> str | None:
        return normalize_reasoning_effort(value)


class ImageGenerationRequest(InternalRequestModel):
    model: str = Field(min_length=1, max_length=MAX_MODEL_NAME_LENGTH)
    prompt: str = Field(min_length=1, max_length=MAX_PROMPT_LENGTH)
    width: Annotated[int, Field(ge=768)] = 1024
    height: Annotated[int, Field(ge=768)] = 1024

    @field_validator("model", "prompt")
    @classmethod
    def trim_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value cannot be blank.")
        return value

    @model_validator(mode="after")
    def validate_pixel_count(self) -> "ImageGenerationRequest":
        if self.width * self.height > 1_048_576:
            raise ValueError("Image dimensions cannot exceed 1,048,576 total pixels.")
        return self


class RealtimeSessionRequest(InternalRequestModel):
    model: str | None = Field(default=None, max_length=MAX_MODEL_NAME_LENGTH)
    instructions: str = Field(
        default="You are a helpful Foundry voice assistant. Keep responses concise.",
        max_length=MAX_INSTRUCTIONS_LENGTH,
    )
    voice: str = Field(default="alloy", max_length=100)

    @field_validator("model", "instructions", "voice")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

