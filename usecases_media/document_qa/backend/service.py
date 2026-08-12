import logging
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any

from app.application.chat import ChatService
from app.application.chat_errors import guardrail_error_details, public_provider_error
from app.application.chat_guardrails import GuardrailOption
from app.application.contracts.chat import ChatCommand
from app.application.conversation_messages import append_message
from app.application.conversations import (
    conversation_to_dict,
    get_conversation,
    get_or_create_conversation,
    message_to_dict,
)
from app.application.models import get_model_settings
from app.core.errors import ApplicationError, ExternalServiceError
from app.domain.identity import UserScope
from app.domain.models import Conversation, ConversationMessage, ModelSettings
from usecases_media.document_qa.backend.gateway import DocumentGateway
from usecases_media.document_qa.backend.store import chunk_to_dict, document_to_dict

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PreparedDocumentQuestion:
    conversation: Conversation
    model_settings: ModelSettings
    variants: list[GuardrailOption]
    histories: dict[str | None, list[dict[str, str]]]
    user_message: ConversationMessage
    retrieval: dict[str, Any]
    grounded_prompt: str
    system_prompt: str


class DocumentQaService:
    def __init__(self, chat: ChatService, gateway: DocumentGateway) -> None:
        self.chat = chat
        self.gateway = gateway

    def list_documents(self, scope: UserScope) -> list[dict[str, Any]]:
        try:
            documents = self.gateway.list_documents(scope)
        except Exception as exc:
            raise ExternalServiceError("Document listing") from exc
        return [document_to_dict(item) for item in documents]

    def add_document(
        self,
        scope: UserScope,
        filename: str,
        content_type: str | None,
        data: bytes,
    ) -> dict[str, Any]:
        try:
            return self.gateway.add(scope, filename, content_type, data)
        except ApplicationError:
            raise
        except Exception as exc:
            raise ExternalServiceError("Document upload") from exc

    def delete_document(self, scope: UserScope, document_id: str) -> bool:
        try:
            return self.gateway.delete(scope, document_id)
        except Exception as exc:
            raise ExternalServiceError("Document deletion") from exc

    def prepare(
        self,
        request: ChatCommand,
        scope: UserScope,
    ) -> PreparedDocumentQuestion:
        conversation = get_or_create_conversation(
            self.chat.conversations,
            scope,
            request.conversation_id,
            request.prompt,
            request.use_case,
        )
        try:
            retrieval = self.gateway.retrieve(scope, request.prompt)
        except ApplicationError:
            raise
        except Exception as exc:
            raise ExternalServiceError("Document question") from exc
        grounded_prompt = self.gateway.grounded_prompt(request.prompt, retrieval["chunks"])
        model_settings = get_model_settings(self.chat.models, request.model)
        variants = self.chat.guardrail_variants(model_settings, request.guardrail_comparison)
        histories = self.chat.guardrail_histories(scope, conversation.id, request.model, variants)
        user_message = append_message(
            self.chat.conversations,
            scope=scope,
            conversation_id=conversation.id,
            role="user",
            content=request.prompt,
        )
        return PreparedDocumentQuestion(
            conversation=conversation,
            model_settings=model_settings,
            variants=variants,
            histories=histories,
            user_message=user_message,
            retrieval=retrieval,
            grounded_prompt=grounded_prompt,
            system_prompt=self.gateway.system_prompt(model_settings.system_prompt),
        )

    def stream(
        self,
        request: ChatCommand,
        scope: UserScope,
        prepared: PreparedDocumentQuestion,
    ) -> Iterator[dict]:
        yield {
            "type": "start",
            "model": request.model,
            "api_surface": prepared.model_settings.api_surface,
            "conversation": conversation_to_dict(
                get_conversation(self.chat.conversations, scope, prepared.conversation.id)
                or prepared.conversation
            ),
            "user_message": message_to_dict(prepared.user_message),
            "guardrail_comparison": request.guardrail_comparison,
            "guardrail_policy_names": list(prepared.model_settings.guardrail_policy_names),
        }
        yield {
            "type": "retrieval",
            "sources": [chunk_to_dict(chunk) for chunk in prepared.retrieval["chunks"]],
            "embedding": prepared.retrieval["embedding"],
        }
        if request.guardrail_comparison:
            with ThreadPoolExecutor(max_workers=2) as executor:
                futures = [
                    executor.submit(
                        self.chat.run_and_store_variant,
                        scope=scope,
                        conversation_id=prepared.conversation.id,
                        model_settings=prepared.model_settings,
                        prompt=prepared.grounded_prompt,
                        system_prompt=prepared.system_prompt,
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
                            get_conversation(
                                self.chat.conversations, scope, prepared.conversation.id
                            )
                            or prepared.conversation
                        ),
                    }
            yield {
                "type": "comparison_completed",
                "conversation": conversation_to_dict(
                    get_conversation(self.chat.conversations, scope, prepared.conversation.id)
                    or prepared.conversation
                ),
            }
            return

        try:
            for event in self.chat.bounded_stream(
                model=request.model,
                prompt=prepared.grounded_prompt,
                api_surface=prepared.model_settings.api_surface,
                system_prompt=prepared.system_prompt,
                temperature=prepared.model_settings.temperature,
                top_p=prepared.model_settings.top_p,
                max_tokens=prepared.model_settings.max_tokens,
                repetition_penalty=prepared.model_settings.repetition_penalty,
                reasoning_effort=request.reasoning_effort,
                history=prepared.histories[None],
            ):
                if event["type"] in {"foundry_request", "foundry_response", "delta"}:
                    yield event
                elif event["type"] == "completed":
                    assistant_message = append_message(
                        self.chat.conversations,
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
                            get_conversation(
                                self.chat.conversations, scope, prepared.conversation.id
                            )
                            or prepared.conversation
                        ),
                        "assistant_message": message_to_dict(assistant_message),
                    }
        except Exception as exc:
            logger.exception("document_answer_stream_failed")
            guardrail_results = guardrail_error_details(exc)
            public_error = public_provider_error("Document answer stream", exc)
            assistant_message = append_message(
                self.chat.conversations,
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
                    get_conversation(self.chat.conversations, scope, prepared.conversation.id)
                    or prepared.conversation
                ),
                "assistant_message": message_to_dict(assistant_message),
            }
