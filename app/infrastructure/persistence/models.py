import hashlib
from datetime import UTC, datetime
from typing import Any

from app.domain.identity import UserScope
from app.domain.models import (
    DEPLOYMENT_DEFAULT_GUARDRAIL,
    Conversation,
    ConversationMessage,
    ModelSettings,
    UseCaseBinding,
    normalize_api_surface,
    normalize_guardrail_policy_name,
    normalize_guardrail_policy_names,
    normalize_modalities,
)

CONVERSATION_TYPE = "conversation"
MESSAGE_TYPE = "conversation_message"
MODEL_SETTINGS_PARTITION = "model-settings"
MODEL_SETTINGS_TYPE = "model_settings"
USE_CASE_SETTINGS_PARTITION = "use-case-bindings"
USE_CASE_SETTINGS_TYPE = "use_case_binding"



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
        routed_model=record.get("routed_model"),
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
            [DEPLOYMENT_DEFAULT_GUARDRAIL, legacy_policy_name] if legacy_policy_name else []
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


def use_case_settings_document(settings: UseCaseBinding) -> dict[str, Any]:
    return {
        "id": settings.use_case,
        "partition_key": USE_CASE_SETTINGS_PARTITION,
        "document_type": USE_CASE_SETTINGS_TYPE,
        "use_case": settings.use_case,
        "binding": settings.binding,
        "updated_at": datetime.now(UTC).isoformat(),
    }


def scoped_document_id(scope: UserScope, document_id: str) -> str:
    return f"{scope.owner_key}:{document_id}"
