from pydantic import BaseModel, ConfigDict

from app.api.features.shared_schemas import ProviderMetadata
from app.infrastructure.persistence.models import GuardrailVariant, MessageRole


class UsageResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None


class ConversationResponse(BaseModel):
    id: str
    title: str
    use_case: str
    created_at: str
    updated_at: str


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: MessageRole
    content: str
    model: str | None
    api_surface: str | None
    duration_ms: int | None
    error: str | None
    usage: UsageResponse | None
    guardrail_variant: GuardrailVariant | None
    guardrail_policy_name: str | None
    guardrail_results: ProviderMetadata | None
    created_at: str


class ConversationListResponse(BaseModel):
    conversations: list[ConversationResponse]
    next_cursor: str | None


class ConversationDetailResponse(BaseModel):
    conversation: ConversationResponse
    messages: list[MessageResponse]


class MetricsDayResponse(BaseModel):
    date: str
    label: str
    requests: int
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    estimated_cost: float
    total_duration_ms: int
    duration_count: int
    avg_duration_ms: int


class MetricsSummaryResponse(BaseModel):
    requests: int
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    estimated_cost: float
    avg_prompt_tokens: int
    avg_completion_tokens: int
    avg_total_tokens: int
    avg_duration_ms: int


class ModelMetricsResponse(BaseModel):
    days: list[MetricsDayResponse]
    models: list[str]
    summary: MetricsSummaryResponse
