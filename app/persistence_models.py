import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal

from app.security import UserScope


MessageRole = Literal["user", "assistant"]
GuardrailVariant = Literal["baseline", "guarded", "policy_1", "policy_2"]
CONVERSATION_TYPE = "conversation"
MESSAGE_TYPE = "conversation_message"
MODEL_SETTINGS_PARTITION = "model-settings"
MODEL_SETTINGS_TYPE = "model_settings"
DEPLOYMENT_DEFAULT_GUARDRAIL = "deployment_default"
API_SURFACES = {"responses", "chat_completions"}
MODEL_MODALITIES = {"text", "image", "voice"}


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


def conversation_from_record(record: dict[str, Any]) -> Conversation:
    return Conversation(
        id=record.get("conversation_id") or record["id"],
        title=record["title"],
        use_case=record.get("use_case") or "text_chat",
        created_at=record["created_at"],
        updated_at=record["updated_at"],
    )


def message_from_record(record: dict[str, Any]) -> ConversationMessage:
    return ConversationMessage(
        id=record.get("message_id") or record["id"],
        conversation_id=record["conversation_id"],
        role=record["role"],
        content=record["content"],
        model=record.get("model"),
        api_surface=record.get("api_surface"),
        duration_ms=record.get("duration_ms"),
        error=record.get("error"),
        usage=record.get("usage"),
        guardrail_variant=record.get("guardrail_variant"),
        guardrail_policy_name=record.get("guardrail_policy_name"),
        guardrail_results=record.get("guardrail_results"),
        created_at=record["created_at"],
    )


def settings_from_record(record: dict[str, Any]) -> ModelSettings:
    policy_names = record.get("guardrail_policy_names")
    if policy_names is None:
        legacy_policy_name = normalize_guardrail_policy_name(record.get("guardrail_policy_name"))
        policy_names = (
            [DEPLOYMENT_DEFAULT_GUARDRAIL, legacy_policy_name]
            if legacy_policy_name
            else []
        )
    return ModelSettings(
        model=record["model"],
        api_surface=normalize_api_surface(record.get("api_surface", "responses")),
        modalities=normalize_modalities(record.get("modalities", ["text"])),
        system_prompt=record["system_prompt"],
        temperature=record["temperature"],
        top_p=record["top_p"],
        max_tokens=record["max_tokens"],
        repetition_penalty=record["repetition_penalty"],
        guardrail_policy_names=normalize_guardrail_policy_names(policy_names),
    )


def model_document_id(model: str) -> str:
    digest = hashlib.sha256(model.lower().encode("utf-8")).hexdigest()
    return f"model-{digest}"


def settings_document(settings: ModelSettings) -> dict[str, Any]:
    return {
        "id": model_document_id(settings.model),
        "partition_key": MODEL_SETTINGS_PARTITION,
        "document_type": MODEL_SETTINGS_TYPE,
        "model": settings.model,
        "api_surface": settings.api_surface,
        "modalities": list(settings.modalities),
        "system_prompt": settings.system_prompt,
        "temperature": settings.temperature,
        "top_p": settings.top_p,
        "max_tokens": settings.max_tokens,
        "repetition_penalty": settings.repetition_penalty,
        "guardrail_policy_names": list(settings.guardrail_policy_names),
        "updated_at": datetime.now(UTC).isoformat(),
    }


def scoped_document_id(scope: UserScope, document_id: str) -> str:
    return f"{scope.owner_key}:{document_id}"


def normalize_api_surface(api_surface: str) -> str:
    normalized_surface = api_surface.strip().lower()
    if normalized_surface not in API_SURFACES:
        raise ValueError("API surface must be 'responses' or 'chat_completions'.")
    return normalized_surface


def normalize_guardrail_policy_name(policy_name: str | None) -> str | None:
    if policy_name is None:
        return None
    normalized_name = policy_name.strip()
    return normalized_name or None


def normalize_guardrail_policy_names(
    policy_names: tuple[str, ...] | list[str],
) -> tuple[str, ...]:
    return tuple(
        normalized
        for policy_name in policy_names
        if (normalized := normalize_guardrail_policy_name(policy_name)) is not None
    )


def normalize_modalities(modalities: tuple[str, ...] | list[str]) -> tuple[str, ...]:
    normalized_modalities = tuple(
        dict.fromkeys(modality.strip().lower() for modality in modalities if modality.strip())
    )
    if not normalized_modalities:
        raise ValueError("Select at least one model capability.")
    unsupported = sorted(set(normalized_modalities) - MODEL_MODALITIES)
    if unsupported:
        raise ValueError(
            "Model capabilities must be one or more of: "
            f"{', '.join(sorted(MODEL_MODALITIES))}."
        )
    return normalized_modalities
