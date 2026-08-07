from typing import Literal

from pydantic import BaseModel

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
