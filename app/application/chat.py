import logging
import threading
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any

from app.api.schemas import ChatRequest
from app.application.conversations import (
    Conversation,
    ConversationMessage,
    append_message,
    build_model_history,
    conversation_to_dict,
    get_conversation,
    get_or_create_conversation,
    message_to_dict,
)
from app.application.models import (
    DEPLOYMENT_DEFAULT_GUARDRAIL,
    ModelSettings,
    get_model_settings,
)
from app.core.concurrency import model_call_semaphore
from app.core.errors import InvalidRequestError
from app.domain.identity import UserScope
from app.infrastructure.azure.foundry.gateway import DefaultFoundryChatGateway, FoundryChatGateway
from app.infrastructure.azure.foundry.tracing import redact_foundry_trace
from app.infrastructure.persistence.models import GuardrailVariant

logger = logging.getLogger(__name__)
GuardrailOption = tuple[GuardrailVariant | None, str | None]
CONTENT_FILTER_MESSAGE = (
    "Request blocked by the configured content safety policy. "
    "Modify your prompt and try again."
)


@dataclass(frozen=True)
class PreparedChat:
    conversation: Conversation
    model_settings: ModelSettings
    variants: list[GuardrailOption]
    histories: dict[str | None, list[dict[str, str]]]
    user_message: ConversationMessage


class ChatService:
    def __init__(
        self,
        gateway: FoundryChatGateway | None = None,
        *,
        concurrency: int | None = None,
    ) -> None:
        self.gateway = gateway or DefaultFoundryChatGateway()
        self._semaphore = (
            model_call_semaphore
            if concurrency is None
            else threading.BoundedSemaphore(concurrency)
        )

    def guardrail_variants(
        self,
        model_settings: ModelSettings,
        enabled: bool,
    ) -> list[GuardrailOption]:
        if not enabled:
            return [(None, None)]
        if len(model_settings.guardrail_policy_names) != 2:
            raise InvalidRequestError(
                f"Guardrail comparison is enabled for {model_settings.model}, "
                "but two policies are not selected."
            )
        return [
            (
                "policy_1" if index == 0 else "policy_2",
                None if policy_name == DEPLOYMENT_DEFAULT_GUARDRAIL else policy_name,
            )
            for index, policy_name in enumerate(model_settings.guardrail_policy_names)
        ]

    def guardrail_histories(
        self,
        scope: UserScope,
        conversation_id: str,
        model: str,
        variants: list[GuardrailOption],
    ) -> dict[str | None, list[dict[str, str]]]:
        return {
            variant: build_model_history(
                scope,
                conversation_id,
                model,
                variant,
                policy_name,
            )
            for variant, policy_name in variants
        }

    def prepare(self, request: ChatRequest, scope: UserScope) -> PreparedChat:
        conversation = get_or_create_conversation(
            scope,
            request.conversation_id,
            request.prompt,
            request.use_case,
        )
        model_settings = get_model_settings(request.model)
        variants = self.guardrail_variants(
            model_settings,
            request.guardrail_comparison,
        )
        histories = self.guardrail_histories(
            scope,
            conversation.id,
            request.model,
            variants,
        )
        user_message = append_message(
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

    def run_and_store_variant(
        self,
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
    ) -> dict[str, Any]:
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
        foundry_request = self.gateway.build_request_trace(**request_arguments)
        try:
            with self._semaphore:
                response = self.gateway.complete(**request_arguments)
        except Exception as exc:
            logger.exception("model_request_failed")
            guardrail_results = guardrail_error_details(exc)
            public_error = public_provider_error("Model request", exc)
            assistant_message = append_message(
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
            return {
                "model": model_settings.model,
                "api_surface": model_settings.api_surface,
                "error": public_error,
                "guardrail_variant": variant,
                "guardrail_policy_name": policy_name,
                "guardrail_results": guardrail_results,
                "assistant_message": message_to_dict(assistant_message),
                "foundry_request": redact_foundry_trace(foundry_request),
            }
        assistant_message = append_message(
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
        )
        return {
            **response,
            "guardrail_variant": variant,
            "assistant_message": message_to_dict(assistant_message),
        }

    async def complete(self, request: ChatRequest, scope: UserScope) -> dict[str, Any]:
        import asyncio

        prepared = self.prepare(request, scope)
        results = await asyncio.gather(
            *(
                asyncio.to_thread(
                    self.run_and_store_variant,
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
                get_conversation(scope, prepared.conversation.id) or prepared.conversation
            ),
            "user_message": message_to_dict(prepared.user_message),
            "results": results,
        }
        if len(results) == 1:
            payload.update(results[0])
        return payload

    def stream(self, request: ChatRequest, scope: UserScope, prepared: PreparedChat) -> Iterator[dict]:
        yield {
            "type": "start",
            "model": request.model,
            "api_surface": prepared.model_settings.api_surface,
            "conversation": conversation_to_dict(
                get_conversation(scope, prepared.conversation.id) or prepared.conversation
            ),
            "user_message": message_to_dict(prepared.user_message),
            "guardrail_comparison": request.guardrail_comparison,
            "guardrail_policy_names": list(prepared.model_settings.guardrail_policy_names),
        }
        if request.guardrail_comparison:
            yield from self._stream_guardrail_results(request, scope, prepared)
            return

        try:
            with self._semaphore:
                events = self.gateway.stream(
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
                        yield event
                    elif event["type"] == "completed":
                        assistant_message = append_message(
                            scope=scope,
                            conversation_id=prepared.conversation.id,
                            role="assistant",
                            content=event["content"],
                            model=request.model,
                            api_surface=prepared.model_settings.api_surface,
                            duration_ms=event["duration_ms"],
                            usage=event["usage"],
                            guardrail_results=event["guardrail_results"],
                        )
                        yield {
                            "type": "completed",
                            "conversation": conversation_to_dict(
                                get_conversation(scope, prepared.conversation.id)
                                or prepared.conversation
                            ),
                            "assistant_message": message_to_dict(assistant_message),
                        }
        except Exception as exc:
            logger.exception("model_stream_failed")
            guardrail_results = guardrail_error_details(exc)
            public_error = public_provider_error("Model stream", exc)
            assistant_message = append_message(
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
                    get_conversation(scope, prepared.conversation.id) or prepared.conversation
                ),
                "assistant_message": message_to_dict(assistant_message),
            }

    def _stream_guardrail_results(
        self,
        request: ChatRequest,
        scope: UserScope,
        prepared: PreparedChat,
    ) -> Iterator[dict]:
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [
                executor.submit(
                    self.run_and_store_variant,
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
                        get_conversation(scope, prepared.conversation.id)
                        or prepared.conversation
                    ),
                }
        yield {
            "type": "comparison_completed",
            "conversation": conversation_to_dict(
                get_conversation(scope, prepared.conversation.id) or prepared.conversation
            ),
        }


def guardrail_error_details(exc: Exception) -> dict[str, Any] | None:
    body = getattr(exc, "body", None)
    return body if isinstance(body, dict) else None


def public_provider_error(operation: str, exc: Exception) -> str:
    body = guardrail_error_details(exc)
    if body is not None:
        error = body.get("error")
        details = error if isinstance(error, dict) else body
        code = details.get("code")
        if isinstance(code, str) and code.lower() == "content_filter":
            return CONTENT_FILTER_MESSAGE
    return f"{operation} failed. Try again later."


chat_service = ChatService()


def guardrail_variants(settings: ModelSettings, enabled: bool) -> list[GuardrailOption]:
    return chat_service.guardrail_variants(settings, enabled)


def guardrail_histories(
    scope: UserScope,
    conversation_id: str,
    model: str,
    variants: list[GuardrailOption],
) -> dict[str | None, list[dict[str, str]]]:
    return chat_service.guardrail_histories(scope, conversation_id, model, variants)


def run_and_store_variant(**kwargs: Any) -> dict[str, Any]:
    return chat_service.run_and_store_variant(**kwargs)


def bounded_stream_chat(**kwargs: Any) -> Iterator[dict[str, Any]]:
    with chat_service._semaphore:
        yield from chat_service.gateway.stream(**kwargs)
