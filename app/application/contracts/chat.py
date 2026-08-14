from dataclasses import dataclass
from typing import Any, Literal, NotRequired, TypedDict

from app.domain.models import GuardrailVariant

ReasoningEffort = Literal["none", "minimal", "low", "medium", "high", "xhigh"]


@dataclass(frozen=True)
class ChatCommand:
    model: str
    prompt: str
    conversation_id: str | None
    reasoning_effort: ReasoningEffort | None
    guardrail_comparison: bool
    use_case: str


class TokenUsage(TypedDict, total=False):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class FoundryRequestTrace(TypedDict, total=False):
    operation: str
    api_surface: str
    model: str
    payload: dict[str, Any]


class FoundryResponseTrace(TypedDict, total=False):
    operation: str
    api_surface: str
    model: str
    payload: Any
    usage: TokenUsage
    guardrail_results: dict[str, Any] | None


class StoredMessageResult(TypedDict):
    id: str
    conversation_id: str
    role: str
    content: str
    model: str | None
    routed_model: str | None
    api_surface: str | None
    duration_ms: int | None
    error: str | None
    usage: dict[str, Any] | None
    guardrail_variant: GuardrailVariant | None
    guardrail_policy_name: str | None
    guardrail_results: dict[str, Any] | None
    created_at: str


class ModelResult(TypedDict):
    model: str
    api_surface: str
    routed_model: NotRequired[str | None]
    assistant_message: StoredMessageResult
    guardrail_variant: GuardrailVariant | None
    guardrail_policy_name: NotRequired[str | None]
    guardrail_results: NotRequired[dict[str, Any] | None]
    content: NotRequired[str]
    duration_ms: NotRequired[int]
    usage: NotRequired[TokenUsage]
    error: NotRequired[str]
    foundry_request: NotRequired[FoundryRequestTrace]
    foundry_response: NotRequired[FoundryResponseTrace]


class ChatCompletionResult(TypedDict):
    model: str
    conversation: dict[str, Any]
    user_message: StoredMessageResult
    results: list[ModelResult]


class ChatStartEvent(TypedDict):
    type: Literal["start"]
    model: str
    api_surface: str
    conversation: dict[str, Any]
    user_message: StoredMessageResult
    guardrail_comparison: bool
    guardrail_policy_names: list[str]


class ChatDeltaEvent(TypedDict):
    type: Literal["delta"]
    delta: str


class FoundryRequestEvent(TypedDict):
    type: Literal["foundry_request"]
    request: FoundryRequestTrace


class FoundryResponseEvent(TypedDict):
    type: Literal["foundry_response"]
    response: FoundryResponseTrace


class ChatCompletedEvent(TypedDict):
    type: Literal["completed"]
    conversation: dict[str, Any]
    assistant_message: StoredMessageResult


class ChatErrorEvent(TypedDict):
    type: Literal["error"]
    error: str
    conversation: dict[str, Any]
    assistant_message: StoredMessageResult


class GuardrailVariantEvent(TypedDict):
    type: Literal["variant_completed"]
    result: ModelResult
    conversation: dict[str, Any]


class GuardrailCompletedEvent(TypedDict):
    type: Literal["comparison_completed"]
    conversation: dict[str, Any]


ChatStreamEvent = (
    ChatStartEvent
    | ChatDeltaEvent
    | FoundryRequestEvent
    | FoundryResponseEvent
    | ChatCompletedEvent
    | ChatErrorEvent
    | GuardrailVariantEvent
    | GuardrailCompletedEvent
)
