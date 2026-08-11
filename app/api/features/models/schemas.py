from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.infrastructure.persistence.models import MODEL_MODALITIES

MAX_INSTRUCTIONS_LENGTH = 20_000
MAX_MODEL_NAME_LENGTH = 200


class InternalRequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


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

ModelModality = Literal["text", "image", "voice"]
ApiSurface = Literal["responses", "chat_completions"]


class ModelSettingsResponse(BaseModel):
    model: str
    api_surface: ApiSurface
    modalities: list[ModelModality]
    system_prompt: str
    temperature: float
    top_p: float
    max_tokens: int
    repetition_penalty: float
    guardrail_policy_names: list[str]


class GuardrailContentFilterResponse(BaseModel):
    name: str
    source: str
    enabled: bool
    blocking: bool
    severity_threshold: str | None


class GuardrailPolicyResponse(BaseModel):
    id: str | None
    name: str
    type: str
    mode: str
    base_policy_name: str | None
    content_filters: list[GuardrailContentFilterResponse]
    is_selectable: bool


class GuardrailPolicyListResponse(BaseModel):
    policies: list[GuardrailPolicyResponse]


class DeploymentGuardrailPolicyResponse(BaseModel):
    deployment_name: str
    policy_name: str | None


class DeploymentSummaryResponse(BaseModel):
    name: str
    model_name: str | None
    model_version: str | None
    provisioning_state: str


class ModelsResponse(BaseModel):
    models: list[str]
    transcription_models: list[str]
    traditional_transcription_models: list[str]
    tts_models: list[str]
    deployments: list[DeploymentSummaryResponse]
    model_modalities: dict[str, list[ModelModality]] | None = None
    discovery_error: str | None


class ModelRegistrationResponse(BaseModel):
    models: list[str]
    settings: ModelSettingsResponse
