from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.persistence_models import MODEL_MODALITIES

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


def _normalize_modalities(value: list[str]) -> list[str]:
    modalities = list(
        dict.fromkeys(modality.strip().lower() for modality in value if modality.strip())
    )
    if not modalities:
        raise ValueError("Select at least one model capability.")
    unsupported = sorted(set(modalities) - MODEL_MODALITIES)
    if unsupported:
        raise ValueError(
            "Model capabilities must be one or more of: "
            f"{', '.join(sorted(MODEL_MODALITIES))}."
        )
    return modalities


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


class ModelSettingsRequest(InternalRequestModel):
    model: str = Field(min_length=1, max_length=MAX_MODEL_NAME_LENGTH)
    api_surface: str = "responses"
    modalities: list[str] = Field(default_factory=lambda: ["text"])
    system_prompt: str = Field(default="", max_length=MAX_INSTRUCTIONS_LENGTH)
    temperature: Annotated[float, Field(ge=0, le=2)] = 0.7
    top_p: Annotated[float, Field(gt=0, le=1)] = 1.0
    max_tokens: Annotated[int, Field(ge=1, le=4096)] = 1024
    repetition_penalty: Annotated[float, Field(ge=1, le=2)] = 1.0
    guardrail_policy_names: list[str] = Field(default_factory=list)

    @field_validator("model")
    @classmethod
    def trim_model(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Model deployment name cannot be blank.")
        return value

    @field_validator("api_surface")
    @classmethod
    def normalize_api_surface(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in {"responses", "chat_completions"}:
            raise ValueError("API surface must be 'responses' or 'chat_completions'.")
        return value

    @field_validator("modalities")
    @classmethod
    def normalize_modalities(cls, value: list[str]) -> list[str]:
        return _normalize_modalities(value)

    @field_validator("guardrail_policy_names")
    @classmethod
    def trim_guardrail_policy_names(cls, value: list[str]) -> list[str]:
        return [policy_name.strip() for policy_name in value if policy_name.strip()]


class ModelRegistrationRequest(InternalRequestModel):
    model: str = Field(min_length=1, max_length=MAX_MODEL_NAME_LENGTH)

    @field_validator("model")
    @classmethod
    def trim_model(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Model deployment name cannot be blank.")
        return value


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


class AdminDeploymentRequest(InternalRequestModel):
    deployment_name: str = Field(min_length=1)
    model_name: str = Field(min_length=1)
    model_version: str = Field(min_length=1)
    model_format: str = "OpenAI"
    sku_name: str = "Standard"
    sku_capacity: Annotated[int, Field(ge=1)] = 1
    version_upgrade_option: str = "OnceNewDefaultVersionAvailable"
    rai_policy_name: str | None = None
    wait_for_completion: bool = False
    api_surface: str = "responses"
    modalities: list[str] = Field(default_factory=lambda: ["text"])

    @field_validator(
        "deployment_name",
        "model_name",
        "model_version",
        "model_format",
        "sku_name",
        "version_upgrade_option",
    )
    @classmethod
    def trim_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value cannot be blank.")
        return value

    @field_validator("rai_policy_name")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @field_validator("api_surface")
    @classmethod
    def normalize_api_surface(cls, value: str) -> str:
        return ModelSettingsRequest.normalize_api_surface(value)

    @field_validator("modalities")
    @classmethod
    def normalize_modalities(cls, value: list[str]) -> list[str]:
        return _normalize_modalities(value)
