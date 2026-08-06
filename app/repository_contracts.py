from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable

from app.persistence_models import Conversation, ConversationMessage, ModelSettings
from app.security import UserScope


@dataclass(frozen=True)
class UsageRecord:
    model: str
    duration_ms: int | None
    usage: dict[str, Any] | None
    created_at: str


@runtime_checkable
class ConversationRepository(Protocol):
    def list_conversations(
        self,
        scope: UserScope,
        use_case: str,
        limit: int,
        offset: int,
    ) -> list[Conversation]: ...

    def create_conversation(self, scope: UserScope, conversation: Conversation) -> None: ...

    def get_conversation(
        self,
        scope: UserScope,
        conversation_id: str,
    ) -> Conversation | None: ...

    def list_messages(
        self,
        scope: UserScope,
        conversation_id: str,
    ) -> list[ConversationMessage]: ...

    def append_message(self, scope: UserScope, message: ConversationMessage) -> None: ...

    def delete_conversation(self, scope: UserScope, conversation_id: str) -> bool: ...

    def list_usage(
        self,
        scope: UserScope,
        start_at: str,
        model: str | None,
    ) -> list[UsageRecord]: ...


@runtime_checkable
class ModelSettingsRepository(Protocol):
    def list_models(self) -> list[str]: ...

    def get_settings(self, model: str) -> ModelSettings | None: ...

    def add_settings_if_absent(self, settings: ModelSettings) -> None: ...

    def save_settings(self, settings: ModelSettings) -> None: ...
