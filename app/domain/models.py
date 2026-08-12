from dataclasses import dataclass
from typing import Any, Literal

MessageRole = Literal["user", "assistant"]
GuardrailVariant = Literal["baseline", "guarded", "policy_1", "policy_2"]
ModelModality = Literal["text", "image", "voice"]
API_SURFACES = frozenset({"responses", "chat_completions"})
MODEL_MODALITIES = frozenset({"text", "image", "voice"})
DEPLOYMENT_DEFAULT_GUARDRAIL = "deployment_default"


@dataclass(frozen=True)
class Conversation:
    id: str
    title: str
    use_case: str
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class ConversationMessage:
    id: str
    conversation_id: str
    role: MessageRole
    content: str
    model: str | None
    api_surface: str | None
    duration_ms: int | None
    error: str | None
    usage: dict[str, Any] | None
    guardrail_variant: GuardrailVariant | None
    guardrail_policy_name: str | None
    guardrail_results: dict[str, Any] | None
    created_at: str


@dataclass(frozen=True)
class ModelSettings:
    model: str
    api_surface: str = "responses"
    modalities: tuple[str, ...] = ("text",)
    system_prompt: str = "You are a concise, helpful assistant."
    temperature: float = 0.7
    top_p: float = 1.0
    max_tokens: int = 1024
    repetition_penalty: float = 1.0
    guardrail_policy_names: tuple[str, ...] = ()


@dataclass(frozen=True)
class UseCaseBinding:
    use_case: str
    binding: str


def normalize_api_surface(api_surface: str) -> str:
    normalized = api_surface.strip().lower()
    if normalized not in API_SURFACES:
        raise ValueError("API surface must be 'responses' or 'chat_completions'.")
    return normalized


def normalize_guardrail_policy_name(policy_name: str | None) -> str | None:
    if policy_name is None:
        return None
    normalized = policy_name.strip()
    return normalized or None


def normalize_guardrail_policy_names(
    policy_names: tuple[str, ...] | list[str],
) -> tuple[str, ...]:
    return tuple(
        normalized
        for policy_name in policy_names
        if (normalized := normalize_guardrail_policy_name(policy_name)) is not None
    )


def normalize_modalities(modalities: tuple[str, ...] | list[str]) -> tuple[str, ...]:
    normalized = tuple(
        dict.fromkeys(modality.strip().lower() for modality in modalities if modality.strip())
    )
    if not normalized:
        raise ValueError("Select at least one model capability.")
    unsupported = sorted(set(normalized) - MODEL_MODALITIES)
    if unsupported:
        raise ValueError(
            f"Model capabilities must be one or more of: {', '.join(sorted(MODEL_MODALITIES))}."
        )
    return normalized
