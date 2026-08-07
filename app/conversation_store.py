import base64
import binascii
import json
import uuid
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, TypedDict

from app.errors import InvalidRequestError, NotFoundError
from app.persistence import get_repositories
from app.persistence_models import (
    Conversation,
    ConversationMessage,
    GuardrailVariant,
    MessageRole,
)
from app.repository_contracts import ConversationPageKey
from app.security import UserScope

CURSOR_VERSION = 1


@dataclass(frozen=True)
class ConversationPage:
    conversations: list[Conversation]
    next_cursor: str | None


class MetricsDay(TypedDict):
    date: str
    label: str
    requests: int
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    estimated_cost: float
    total_duration_ms: int
    duration_count: int
    avg_duration_ms: int


class MetricsSummary(TypedDict):
    requests: int
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    estimated_cost: float
    avg_prompt_tokens: int
    avg_completion_tokens: int
    avg_total_tokens: int
    avg_duration_ms: int


class UsageMetrics(TypedDict):
    days: list[MetricsDay]
    models: list[str]
    summary: MetricsSummary


def list_conversations(scope: UserScope, use_case: str = "text_chat") -> list[Conversation]:
    return list_conversation_page(scope, use_case=use_case, limit=100).conversations


def list_conversation_page(
    scope: UserScope,
    *,
    use_case: str = "text_chat",
    limit: int = 50,
    cursor: str | None = None,
) -> ConversationPage:
    if limit < 1 or limit > 100:
        raise InvalidRequestError("Conversation page size must be between 1 and 100.")
    after = _decode_cursor(cursor)
    conversations = get_repositories().conversations.list_conversations(
        scope,
        use_case,
        limit + 1,
        after,
    )
    has_more = len(conversations) > limit
    page_items = conversations[:limit]
    return ConversationPage(
        conversations=page_items,
        next_cursor=_encode_cursor(page_items[-1]) if has_more else None,
    )


def create_conversation(
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
    get_repositories().conversations.create_conversation(scope, conversation)
    return conversation


def get_or_create_conversation(
    scope: UserScope,
    conversation_id: str | None,
    title_seed: str | None = None,
    use_case: str = "text_chat",
) -> Conversation:
    if conversation_id:
        conversation = get_conversation(scope, conversation_id)
        if conversation is None:
            raise NotFoundError("Conversation not found.")
        if conversation.use_case != use_case:
            raise NotFoundError("Conversation belongs to a different use case.")
        return conversation
    return create_conversation(scope, title_seed, use_case)


def get_conversation(scope: UserScope, conversation_id: str) -> Conversation | None:
    return get_repositories().conversations.get_conversation(scope, conversation_id)


def get_conversation_messages(
    scope: UserScope,
    conversation_id: str,
) -> list[ConversationMessage]:
    return get_repositories().conversations.list_messages(scope, conversation_id)


def delete_conversation(scope: UserScope, conversation_id: str) -> bool:
    return get_repositories().conversations.delete_conversation(scope, conversation_id)


def get_usage_metrics(
    *,
    scope: UserScope,
    days: int,
    model: str | None = None,
    input_token_cost_per_1k: float = 0,
    output_token_cost_per_1k: float = 0,
) -> UsageMetrics:
    today = datetime.now(UTC).date()
    start_date = today - timedelta(days=days - 1)
    bucket_dates = [start_date + timedelta(days=offset) for offset in range(days)]
    buckets: dict[str, MetricsDay] = {
        item.isoformat(): {
            "date": item.isoformat(),
            "label": item.strftime("%m/%d"),
            "requests": 0,
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "estimated_cost": 0.0,
            "total_duration_ms": 0,
            "duration_count": 0,
            "avg_duration_ms": 0,
        }
        for item in bucket_dates
    }
    rows = get_repositories().conversations.list_usage(
        scope,
        f"{start_date.isoformat()}T00:00:00+00:00",
        model,
    )

    models: set[str] = set()
    request_count = prompt_tokens = completion_tokens = total_tokens = 0
    duration_total = duration_count = 0
    for row in rows:
        bucket = buckets.get(row.created_at[:10])
        if bucket is None:
            continue
        row_model = row.model
        if row_model:
            models.add(row_model)
        usage = row.usage or {}
        row_prompt_tokens = _usage_value(usage, "prompt_tokens")
        row_completion_tokens = _usage_value(usage, "completion_tokens")
        row_total_tokens = _usage_value(usage, "total_tokens") or (
            row_prompt_tokens + row_completion_tokens
        )
        row_cost = (
            (row_prompt_tokens / 1000) * input_token_cost_per_1k
            + (row_completion_tokens / 1000) * output_token_cost_per_1k
        )
        request_count += 1
        prompt_tokens += row_prompt_tokens
        completion_tokens += row_completion_tokens
        total_tokens += row_total_tokens
        bucket["requests"] += 1
        bucket["prompt_tokens"] += row_prompt_tokens
        bucket["completion_tokens"] += row_completion_tokens
        bucket["total_tokens"] += row_total_tokens
        bucket["estimated_cost"] += row_cost
        duration_ms = row.duration_ms
        if duration_ms is not None:
            duration_total += duration_ms
            duration_count += 1
            bucket["total_duration_ms"] += duration_ms
            bucket["duration_count"] += 1

    for bucket in buckets.values():
        if bucket["duration_count"]:
            bucket["avg_duration_ms"] = round(
                bucket["total_duration_ms"] / bucket["duration_count"]
            )
        bucket["estimated_cost"] = round(bucket["estimated_cost"], 6)
    estimated_cost = (
        (prompt_tokens / 1000) * input_token_cost_per_1k
        + (completion_tokens / 1000) * output_token_cost_per_1k
    )
    return {
        "days": list(buckets.values()),
        "models": sorted(models),
        "summary": {
            "requests": request_count,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "estimated_cost": round(estimated_cost, 6),
            "avg_prompt_tokens": round(prompt_tokens / request_count) if request_count else 0,
            "avg_completion_tokens": round(completion_tokens / request_count)
            if request_count
            else 0,
            "avg_total_tokens": round(total_tokens / request_count) if request_count else 0,
            "avg_duration_ms": round(duration_total / duration_count) if duration_count else 0,
        },
    }


def append_message(
    *,
    scope: UserScope,
    conversation_id: str,
    role: MessageRole,
    content: str,
    model: str | None = None,
    api_surface: str | None = None,
    duration_ms: int | None = None,
    error: str | None = None,
    usage: dict[str, Any] | None = None,
    guardrail_variant: GuardrailVariant | None = None,
    guardrail_policy_name: str | None = None,
    guardrail_results: dict[str, Any] | None = None,
) -> ConversationMessage:
    message_id = str(uuid.uuid4())
    now = _utc_now()
    message = ConversationMessage(
        id=message_id,
        conversation_id=conversation_id,
        role=role,
        content=content,
        model=model,
        api_surface=api_surface,
        duration_ms=duration_ms,
        error=error,
        usage=usage,
        guardrail_variant=guardrail_variant,
        guardrail_policy_name=guardrail_policy_name,
        guardrail_results=guardrail_results,
        created_at=now,
    )
    get_repositories().conversations.append_message(scope, message)
    return message


def build_model_history(
    scope: UserScope,
    conversation_id: str,
    model: str,
    guardrail_variant: GuardrailVariant | None = None,
    guardrail_policy_name: str | None = None,
) -> list[dict[str, str]]:
    history: list[dict[str, str]] = []
    for message in get_conversation_messages(scope, conversation_id):
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


def _usage_value(usage: dict[str, Any], key: str) -> int:
    value = usage.get(key)
    return int(value) if isinstance(value, int | float) else 0

def _encode_cursor(conversation: Conversation) -> str:
    payload = json.dumps(
        {
            "v": CURSOR_VERSION,
            "updated_at": conversation.updated_at,
            "id": conversation.id,
        },
        separators=(",", ":"),
        sort_keys=True,
    )
    return base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii").rstrip("=")


def _decode_cursor(cursor: str | None) -> ConversationPageKey | None:
    if not cursor:
        return None
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        decoded = base64.b64decode(padded, altchars=b"-_", validate=True).decode("utf-8")
        payload = json.loads(decoded)
        if not isinstance(payload, dict) or set(payload) != {"v", "updated_at", "id"}:
            raise ValueError
        version = payload["v"]
        updated_at = payload["updated_at"]
        conversation_id = payload["id"]
        if (
            version != CURSOR_VERSION
            or not isinstance(updated_at, str)
            or not isinstance(conversation_id, str)
            or not updated_at
            or not conversation_id
            or len(updated_at) > 64
            or len(conversation_id) > 128
        ):
            raise ValueError
        parsed_timestamp = datetime.fromisoformat(updated_at)
        if parsed_timestamp.tzinfo is None:
            raise ValueError
    except (binascii.Error, json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
        raise InvalidRequestError("Invalid conversation cursor.") from exc
    return ConversationPageKey(updated_at=updated_at, id=conversation_id)
