import asyncio
import logging
import threading
from collections.abc import Callable
from typing import Any, cast

from app.application.chat_errors import guardrail_error_details, public_provider_error
from app.application.chat_preparation import PreparedChat
from app.application.contracts.chat import (
    ChatCommand,
    ChatCompletionResult,
    ModelResult,
)
from app.application.conversation_messages import append_message
from app.application.conversations import conversation_to_dict, get_conversation, message_to_dict
from app.application.ports.conversations import ConversationRepository
from app.application.ports.foundry_chat import FoundryChatGateway
from app.application.trace import redact_foundry_trace
from app.domain.identity import UserScope
from app.domain.models import GuardrailVariant, ModelSettings

logger = logging.getLogger(__name__)


def run_and_store_variant(
    gateway: FoundryChatGateway,
    conversations: ConversationRepository,
    semaphore: threading.Semaphore,
    *,
    scope: UserScope,
    conversation_id: str,
    model_settings: ModelSettings,
    prompt: str,
    system_prompt: str,
    reasoning_effort: str | None,
    history: list[dict[str, str]],
    variant: GuardrailVariant | None,
    policy_name: str | None,
) -> ModelResult:
    request_arguments = {
        "model": model_settings.model,
        "prompt": prompt,
        "api_surface": model_settings.api_surface,
        "system_prompt": system_prompt,
        "temperature": model_settings.temperature,
        "top_p": model_settings.top_p,
        "max_tokens": model_settings.max_tokens,
        "repetition_penalty": model_settings.repetition_penalty,
        "reasoning_effort": reasoning_effort,
        "history": history,
        "guardrail_policy_name": policy_name,
    }
    foundry_request = gateway.build_request_trace(**request_arguments)
    try:
        with semaphore:
            response = gateway.complete(**request_arguments)
    except Exception as exc:
        logger.exception("model_request_failed")
        guardrail_results = guardrail_error_details(exc)
        public_error = public_provider_error("Model request", exc)
        assistant_message = append_message(
            conversations,
            scope=scope,
            conversation_id=conversation_id,
            role="assistant",
            content="",
            model=model_settings.model,
            api_surface=model_settings.api_surface,
            error=public_error,
            guardrail_variant=variant,
            guardrail_policy_name=policy_name,
            guardrail_results=guardrail_results,
        )
        return cast(
            ModelResult,
            {
                "model": model_settings.model,
                "api_surface": model_settings.api_surface,
                "error": public_error,
                "guardrail_variant": variant,
                "guardrail_policy_name": policy_name,
                "guardrail_results": guardrail_results,
                "assistant_message": message_to_dict(assistant_message),
                "foundry_request": redact_foundry_trace(foundry_request),
            },
        )
    assistant_message = append_message(
        conversations,
        scope=scope,
        conversation_id=conversation_id,
        role="assistant",
        content=response["content"],
        model=model_settings.model,
        api_surface=response["api_surface"],
        duration_ms=response["duration_ms"],
        usage=response["usage"],
        guardrail_variant=variant,
        guardrail_policy_name=policy_name,
        guardrail_results=response["guardrail_results"],
        routed_model=response.get("routed_model"),
    )
    return cast(
        ModelResult,
        {
            **response,
            "guardrail_variant": variant,
            "assistant_message": message_to_dict(assistant_message),
        },
    )


async def complete_chat(
    request: ChatCommand,
    scope: UserScope,
    prepared: PreparedChat,
    conversations: ConversationRepository,
    runner: Callable[..., ModelResult],
) -> ChatCompletionResult:
    results = await asyncio.gather(
        *(
            asyncio.to_thread(
                runner,
                scope=scope,
                conversation_id=prepared.conversation.id,
                model_settings=prepared.model_settings,
                prompt=request.prompt,
                system_prompt=prepared.model_settings.system_prompt,
                reasoning_effort=request.reasoning_effort,
                history=prepared.histories[variant],
                variant=variant,
                policy_name=policy_name,
            )
            for variant, policy_name in prepared.variants
        )
    )
    payload: dict[str, Any] = {
        "model": request.model,
        "conversation": conversation_to_dict(
            get_conversation(conversations, scope, prepared.conversation.id)
            or prepared.conversation
        ),
        "user_message": message_to_dict(prepared.user_message),
        "results": results,
    }
    if len(results) == 1:
        payload.update(results[0])
    return cast(ChatCompletionResult, payload)
