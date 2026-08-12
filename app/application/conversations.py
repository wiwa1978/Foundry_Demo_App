import uuid
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any

from app.application.conversation_cursor import decode_cursor, encode_cursor
from app.application.conversation_metrics import UsageMetrics, calculate_usage_metrics
from app.application.ports.conversations import ConversationRepository
from app.core.errors import InvalidRequestError, NotFoundError
from app.domain.identity import UserScope
from app.domain.models import Conversation, ConversationMessage


@dataclass(frozen=True)
class ConversationPage:
    conversations: list[Conversation]
    next_cursor: str | None


@dataclass(frozen=True)
class ConversationService:
    repository: ConversationRepository

    def list_page(
        self,
        scope: UserScope,
        *,
        use_case: str = "text_chat",
        limit: int = 50,
        cursor: str | None = None,
    ) -> ConversationPage:
        return list_conversation_page(
            self.repository,
            scope,
            use_case=use_case,
            limit=limit,
            cursor=cursor,
        )

    def create(
        self,
        scope: UserScope,
        title: str | None = None,
        use_case: str = "text_chat",
    ) -> Conversation:
        return create_conversation(self.repository, scope, title, use_case)

    def get(self, scope: UserScope, conversation_id: str) -> Conversation | None:
        return get_conversation(self.repository, scope, conversation_id)

    def messages(self, scope: UserScope, conversation_id: str) -> list[ConversationMessage]:
        return get_conversation_messages(self.repository, scope, conversation_id)

    def delete(self, scope: UserScope, conversation_id: str) -> bool:
        return delete_conversation(self.repository, scope, conversation_id)

    def usage_metrics(self, **kwargs: Any) -> UsageMetrics:
        return get_usage_metrics(self.repository, **kwargs)


def list_conversations(
    repository: ConversationRepository,
    scope: UserScope,
    use_case: str = "text_chat",
) -> list[Conversation]:
    return list_conversation_page(repository, scope, use_case=use_case, limit=100).conversations


def list_conversation_page(
    repository: ConversationRepository,
    scope: UserScope,
    *,
    use_case: str = "text_chat",
    limit: int = 50,
    cursor: str | None = None,
) -> ConversationPage:
    if limit < 1 or limit > 100:
        raise InvalidRequestError("Conversation page size must be between 1 and 100.")
    after = decode_cursor(cursor)
    conversations = repository.list_conversations(scope, use_case, limit + 1, after)
    has_more = len(conversations) > limit
    page_items = conversations[:limit]
    return ConversationPage(
        conversations=page_items,
        next_cursor=encode_cursor(page_items[-1]) if has_more else None,
    )


def create_conversation(
    repository: ConversationRepository,
    scope: UserScope,
    title: str | None = None,
    use_case: str = "text_chat",
) -> Conversation:
    conversation_id = str(uuid.uuid4())
    now = _utc_now()
    conversation = Conversation(
        id=conversation_id,
        title=_normalize_title(title),
        use_case=use_case,
        created_at=now,
        updated_at=now,
    )
    repository.create_conversation(scope, conversation)
    return conversation


def get_or_create_conversation(
    repository: ConversationRepository,
    scope: UserScope,
    conversation_id: str | None,
    title_seed: str | None = None,
    use_case: str = "text_chat",
) -> Conversation:
    if conversation_id:
        conversation = get_conversation(repository, scope, conversation_id)
        if conversation is None:
            raise NotFoundError("Conversation not found.")
        if conversation.use_case != use_case:
            raise NotFoundError("Conversation belongs to a different use case.")
        return conversation
    return create_conversation(repository, scope, title_seed, use_case)


def get_conversation(
    repository: ConversationRepository,
    scope: UserScope,
    conversation_id: str,
) -> Conversation | None:
    return repository.get_conversation(scope, conversation_id)


def get_conversation_messages(
    repository: ConversationRepository,
    scope: UserScope,
    conversation_id: str,
) -> list[ConversationMessage]:
    return repository.list_messages(scope, conversation_id)


def delete_conversation(
    repository: ConversationRepository,
    scope: UserScope,
    conversation_id: str,
) -> bool:
    return repository.delete_conversation(scope, conversation_id)


def get_usage_metrics(
    repository: ConversationRepository,
    **kwargs: Any,
) -> UsageMetrics:
    return calculate_usage_metrics(repository, **kwargs)


def conversation_to_dict(conversation: Conversation) -> dict[str, Any]:
    return asdict(conversation)


def message_to_dict(message: ConversationMessage) -> dict[str, Any]:
    return asdict(message)


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _normalize_title(title: str | None) -> str:
    if not title or not title.strip():
        return "New chat"
    normalized = " ".join(title.strip().split())
    return normalized if len(normalized) <= 60 else f"{normalized[:57]}..."
