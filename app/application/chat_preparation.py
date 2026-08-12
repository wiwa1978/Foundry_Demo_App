from dataclasses import dataclass

from app.application.chat_guardrails import GuardrailOption, guardrail_variants
from app.application.contracts.chat import ChatCommand
from app.application.conversation_messages import append_message, build_model_history
from app.application.conversations import get_or_create_conversation
from app.application.models import get_model_settings
from app.application.ports.conversations import ConversationRepository
from app.application.ports.model_settings import ModelSettingsRepository
from app.domain.identity import UserScope
from app.domain.models import Conversation, ConversationMessage, ModelSettings


@dataclass(frozen=True)
class PreparedChat:
    conversation: Conversation
    model_settings: ModelSettings
    variants: list[GuardrailOption]
    histories: dict[str | None, list[dict[str, str]]]
    user_message: ConversationMessage


def build_guardrail_histories(
    repository: ConversationRepository,
    scope: UserScope,
    conversation_id: str,
    model: str,
    variants: list[GuardrailOption],
) -> dict[str | None, list[dict[str, str]]]:
    return {
        variant: build_model_history(
            repository,
            scope,
            conversation_id,
            model,
            variant,
            policy_name,
        )
        for variant, policy_name in variants
    }


def prepare_chat(
    request: ChatCommand,
    scope: UserScope,
    conversations: ConversationRepository,
    models: ModelSettingsRepository,
) -> PreparedChat:
    conversation = get_or_create_conversation(
        conversations,
        scope,
        request.conversation_id,
        request.prompt,
        request.use_case,
    )
    model_settings = get_model_settings(models, request.model)
    variants = guardrail_variants(model_settings, request.guardrail_comparison)
    histories = build_guardrail_histories(
        conversations,
        scope,
        conversation.id,
        request.model,
        variants,
    )
    user_message = append_message(
        conversations,
        scope=scope,
        conversation_id=conversation.id,
        role="user",
        content=request.prompt,
    )
    return PreparedChat(
        conversation=conversation,
        model_settings=model_settings,
        variants=variants,
        histories=histories,
        user_message=user_message,
    )
