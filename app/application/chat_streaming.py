import logging
import threading
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import cast

from app.application.chat_errors import guardrail_error_details, public_provider_error
from app.application.chat_preparation import PreparedChat
from app.application.contracts.chat import (
    ChatCommand,
    ChatStreamEvent,
    ModelResult,
    StoredMessageResult,
)
from app.application.conversation_messages import append_message
from app.application.conversations import conversation_to_dict, get_conversation, message_to_dict
from app.application.ports.conversations import ConversationRepository
from app.application.ports.foundry_chat import FoundryChatGateway
from app.domain.identity import UserScope

logger = logging.getLogger(__name__)


def stream_chat(
    gateway: FoundryChatGateway,
    conversations: ConversationRepository,
    semaphore: threading.Semaphore,
    runner: Callable[..., ModelResult],
    request: ChatCommand,
    scope: UserScope,
    prepared: PreparedChat,
) -> Iterator[ChatStreamEvent]:
    yield {
        "type": "start",
        "model": request.model,
        "api_surface": prepared.model_settings.api_surface,
        "conversation": conversation_to_dict(
            get_conversation(conversations, scope, prepared.conversation.id)
            or prepared.conversation
        ),
        "user_message": cast(StoredMessageResult, message_to_dict(prepared.user_message)),
        "guardrail_comparison": request.guardrail_comparison,
        "guardrail_policy_names": list(prepared.model_settings.guardrail_policy_names),
    }
    if request.guardrail_comparison:
        yield from stream_guardrail_results(conversations, runner, request, scope, prepared)
        return

    try:
        with semaphore:
            events = gateway.stream(
                model=request.model,
                prompt=request.prompt,
                api_surface=prepared.model_settings.api_surface,
                system_prompt=prepared.model_settings.system_prompt,
                temperature=prepared.model_settings.temperature,
                top_p=prepared.model_settings.top_p,
                max_tokens=prepared.model_settings.max_tokens,
                repetition_penalty=prepared.model_settings.repetition_penalty,
                reasoning_effort=request.reasoning_effort,
                history=prepared.histories[None],
            )
            for event in events:
                if event["type"] in {"foundry_request", "foundry_response", "delta"}:
                    yield cast(ChatStreamEvent, event)
                elif event["type"] == "completed":
                    assistant_message = append_message(
                        conversations,
                        scope=scope,
                        conversation_id=prepared.conversation.id,
                        role="assistant",
                        content=event["content"],
                        model=request.model,
                        api_surface=prepared.model_settings.api_surface,
                        duration_ms=event["duration_ms"],
                        usage=event["usage"],
                        guardrail_results=event["guardrail_results"],
                        routed_model=event.get("routed_model"),
                    )
                    yield {
                        "type": "completed",
                        "conversation": conversation_to_dict(
                            get_conversation(conversations, scope, prepared.conversation.id)
                            or prepared.conversation
                        ),
                        "assistant_message": cast(
                            StoredMessageResult,
                            message_to_dict(assistant_message),
                        ),
                    }
    except Exception as exc:
        logger.exception("model_stream_failed")
        guardrail_results = guardrail_error_details(exc)
        public_error = public_provider_error("Model stream", exc)
        assistant_message = append_message(
            conversations,
            scope=scope,
            conversation_id=prepared.conversation.id,
            role="assistant",
            content="",
            model=request.model,
            api_surface=prepared.model_settings.api_surface,
            error=public_error,
            guardrail_results=guardrail_results,
        )
        yield {
            "type": "error",
            "error": public_error,
            "conversation": conversation_to_dict(
                get_conversation(conversations, scope, prepared.conversation.id)
                or prepared.conversation
            ),
            "assistant_message": cast(
                StoredMessageResult,
                message_to_dict(assistant_message),
            ),
        }


def stream_guardrail_results(
    conversations: ConversationRepository,
    runner: Callable[..., ModelResult],
    request: ChatCommand,
    scope: UserScope,
    prepared: PreparedChat,
) -> Iterator[ChatStreamEvent]:
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(
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
        ]
        for future in as_completed(futures):
            yield {
                "type": "variant_completed",
                "result": future.result(),
                "conversation": conversation_to_dict(
                    get_conversation(conversations, scope, prepared.conversation.id)
                    or prepared.conversation
                ),
            }
    yield {
        "type": "comparison_completed",
        "conversation": conversation_to_dict(
            get_conversation(conversations, scope, prepared.conversation.id)
            or prepared.conversation
        ),
    }
