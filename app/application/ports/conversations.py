from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable

from app.domain.identity import UserScope
from app.domain.models import Conversation, ConversationMessage


@dataclass(frozen=True)
class UsageRecord:
    model: str
    duration_ms: int | None
    usage: dict[str, Any] | None
    created_at: str


@dataclass(frozen=True)
class ConversationPageKey:
    updated_at: str
    id: str


@runtime_checkable
class ConversationRepository(Protocol):
    def list_conversations(
        self,
        scope: UserScope,
        use_case: str,
        limit: int,
        after: ConversationPageKey | None,
    ) -> list[Conversation]: ...

    def create_conversation(self, scope: UserScope, conversation: Conversation) -> None: ...
    def get_conversation(self, scope: UserScope, conversation_id: str) -> Conversation | None: ...
    def list_messages(
        self, scope: UserScope, conversation_id: str
    ) -> list[ConversationMessage]: ...
    def append_message(self, scope: UserScope, message: ConversationMessage) -> None: ...
    def delete_conversation(self, scope: UserScope, conversation_id: str) -> bool: ...
    def list_usage(
        self,
        scope: UserScope,
        start_at: str,
        model: str | None,
    ) -> list[UsageRecord]: ...
