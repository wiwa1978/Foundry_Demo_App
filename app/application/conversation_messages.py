import uuid
from datetime import UTC, datetime
from typing import Any

from app.application.ports.conversations import ConversationRepository
from app.domain.identity import UserScope
from app.domain.models import ConversationMessage, GuardrailVariant, MessageRole


def append_message(
    repository: ConversationRepository,
    *,
    scope: UserScope,
    conversation_id: str,
    role: MessageRole,
    content: str,
    model: str | None = None,
    routed_model: str | None = None,
    api_surface: str | None = None,
    duration_ms: int | None = None,
    error: str | None = None,
    usage: dict[str, Any] | None = None,
    guardrail_variant: GuardrailVariant | None = None,
    guardrail_policy_name: str | None = None,
    guardrail_results: dict[str, Any] | None = None,
) -> ConversationMessage:
    message = ConversationMessage(
        id=str(uuid.uuid4()),
        conversation_id=conversation_id,
        role=role,
        content=content,
        model=model,
        routed_model=routed_model,
        api_surface=api_surface,
        duration_ms=duration_ms,
        error=error,
        usage=usage,
        guardrail_variant=guardrail_variant,
        guardrail_policy_name=guardrail_policy_name,
        guardrail_results=guardrail_results,
        created_at=_utc_now(),
    )
    repository.append_message(scope, message)
    return message


def build_model_history(
    repository: ConversationRepository,
    scope: UserScope,
    conversation_id: str,
    model: str,
    guardrail_variant: GuardrailVariant | None = None,
    guardrail_policy_name: str | None = None,
) -> list[dict[str, str]]:
    history: list[dict[str, str]] = []
    for message in repository.list_messages(scope, conversation_id):
        if message.error:
            continue
        if message.role == "user":
            history.append({"role": "user", "content": message.content})
        elif message.model == model and _matches_guardrail_history(
            message,
            guardrail_variant,
            guardrail_policy_name,
        ):
            history.append({"role": "assistant", "content": message.content})
    return history


def _matches_guardrail_history(
    message: ConversationMessage,
    guardrail_variant: GuardrailVariant | None,
    guardrail_policy_name: str | None,
) -> bool:
    if guardrail_policy_name:
        return (message.guardrail_policy_name or "").lower() == guardrail_policy_name.lower()
    if guardrail_variant in {"policy_1", "policy_2"}:
        return message.guardrail_policy_name is None and message.guardrail_variant in {
            None,
            "baseline",
            guardrail_variant,
        }
    return message.guardrail_variant is None or message.guardrail_variant == (
        guardrail_variant or "baseline"
    )


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()
