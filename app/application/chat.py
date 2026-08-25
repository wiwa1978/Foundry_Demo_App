import threading
from collections.abc import Iterator
from typing import Any

from app.application.chat_completion import complete_chat, run_and_store_variant
from app.application.chat_guardrails import GuardrailOption, guardrail_variants
from app.application.chat_preparation import (
    PreparedChat,
    build_guardrail_histories,
    prepare_chat,
)
from app.application.chat_streaming import stream_chat
from app.application.contracts.chat import (
    ChatCommand,
    ChatCompletionResult,
    ChatStreamEvent,
    ModelResult,
)
from app.application.guardrail_batch import evaluate_statement
from app.application.ports.conversations import ConversationRepository
from app.application.ports.foundry_chat import FoundryChatGateway
from app.application.ports.model_settings import ModelSettingsRepository
from app.core.concurrency import model_call_semaphore
from app.domain.identity import UserScope
from app.domain.models import GuardrailVariant, ModelSettings


class ChatService:
    def __init__(
        self,
        gateway: FoundryChatGateway,
        conversations: ConversationRepository,
        models: ModelSettingsRepository,
        *,
        concurrency: int | None = None,
    ) -> None:
        self.gateway = gateway
        self.conversations = conversations
        self.models = models
        self._semaphore = (
            model_call_semaphore if concurrency is None else threading.BoundedSemaphore(concurrency)
        )

    def bounded_stream(self, **kwargs: Any) -> Iterator[dict[str, Any]]:
        with self._semaphore:
            yield from self.gateway.stream(**kwargs)

    def guardrail_variants(
        self,
        model_settings: ModelSettings,
        enabled: bool,
    ) -> list[GuardrailOption]:
        return guardrail_variants(model_settings, enabled)

    def guardrail_histories(
        self,
        scope: UserScope,
        conversation_id: str,
        model: str,
        variants: list[GuardrailOption],
    ) -> dict[str | None, list[dict[str, str]]]:
        return build_guardrail_histories(
            self.conversations,
            scope,
            conversation_id,
            model,
            variants,
        )

    def prepare(self, request: ChatCommand, scope: UserScope) -> PreparedChat:
        return prepare_chat(request, scope, self.conversations, self.models)

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
    ) -> ModelResult:
        return run_and_store_variant(
            self.gateway,
            self.conversations,
            self._semaphore,
            scope=scope,
            conversation_id=conversation_id,
            model_settings=model_settings,
            prompt=prompt,
            system_prompt=system_prompt,
            reasoning_effort=reasoning_effort,
            history=history,
            variant=variant,
            policy_name=policy_name,
        )

    def evaluate_guardrail_statement(
        self,
        *,
        model_settings: ModelSettings,
        statement: str,
        policy_name: str | None,
    ) -> dict[str, Any]:
        with self._semaphore:
            return evaluate_statement(
                self.gateway,
                model_settings=model_settings,
                statement=statement,
                policy_name=policy_name,
            )

    async def complete(
        self,
        request: ChatCommand,
        scope: UserScope,
    ) -> ChatCompletionResult:
        prepared = self.prepare(request, scope)
        return await complete_chat(
            request,
            scope,
            prepared,
            self.conversations,
            self.run_and_store_variant,
        )

    def stream(
        self,
        request: ChatCommand,
        scope: UserScope,
        prepared: PreparedChat,
    ) -> Iterator[ChatStreamEvent]:
        yield from stream_chat(
            self.gateway,
            self.conversations,
            self._semaphore,
            self.run_and_store_variant,
            request,
            scope,
            prepared,
        )
