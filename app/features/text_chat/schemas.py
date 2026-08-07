from pydantic import BaseModel

from app.features.conversations.schemas import (
    ConversationResponse,
    MessageResponse,
    UsageResponse,
)
from app.features.shared_schemas import ProviderMetadata, ProviderTrace
from app.persistence_models import GuardrailVariant


class ProviderResultResponse(BaseModel):
    model: str
    api_surface: str | None = None
    content: str | None = None
    duration_ms: int | None = None
    usage: UsageResponse | None = None
    error: str | None = None
    guardrail_variant: GuardrailVariant | None = None
    guardrail_policy_name: str | None = None
    guardrail_results: ProviderMetadata | None = None
    foundry_request: ProviderTrace | None = None
    foundry_response: ProviderTrace | None = None


class ModelResultResponse(ProviderResultResponse):
    assistant_message: MessageResponse


class GuardrailComparisonResultResponse(BaseModel):
    model: str
    guardrail_comparison: bool
    guardrail_policy_names: list[str]
    variants: list[ModelResultResponse]


class ChatResponse(BaseModel):
    model: str
    conversation: ConversationResponse
    user_message: MessageResponse
    results: list[ModelResultResponse]
    api_surface: str | None = None
    content: str | None = None
    duration_ms: int | None = None
    usage: UsageResponse | None = None
    error: str | None = None
    guardrail_variant: GuardrailVariant | None = None
    guardrail_policy_name: str | None = None
    guardrail_results: ProviderMetadata | None = None
    assistant_message: MessageResponse | None = None
    foundry_request: ProviderTrace | None = None
    foundry_response: ProviderTrace | None = None
