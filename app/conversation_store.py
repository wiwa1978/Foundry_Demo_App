import uuid
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from azure.cosmos.exceptions import CosmosResourceNotFoundError

from app.cosmos_store import get_container, initialize_cosmos_store

MessageRole = Literal["user", "assistant"]
GuardrailVariant = Literal["baseline", "guarded"]
CONVERSATION_TYPE = "conversation"
MESSAGE_TYPE = "conversation_message"


@dataclass(frozen=True)
class Conversation:
    id: str
    title: str
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class ConversationMessage:
    id: str
    conversation_id: str
    role: MessageRole
    content: str
    model: str | None
    api_surface: str | None
    duration_ms: int | None
    error: str | None
    usage: dict[str, Any] | None
    guardrail_variant: GuardrailVariant | None
    guardrail_policy_name: str | None
    guardrail_results: dict[str, Any] | None
    created_at: str


def initialize_conversation_database() -> None:
    initialize_cosmos_store()


def list_conversations() -> list[Conversation]:
    rows = get_container().query_items(
        query=(
            "SELECT c.id, c.title, c.created_at, c.updated_at FROM c "
            "WHERE c.document_type = @document_type ORDER BY c.updated_at DESC"
        ),
        parameters=[{"name": "@document_type", "value": CONVERSATION_TYPE}],
        enable_cross_partition_query=True,
    )
    return [_document_to_conversation(row) for row in rows]


def create_conversation(title: str | None = None) -> Conversation:
    conversation_id = str(uuid.uuid4())
    now = _utc_now()
    document = {
        "id": conversation_id,
        "partition_key": conversation_id,
        "document_type": CONVERSATION_TYPE,
        "title": _normalize_title(title),
        "created_at": now,
        "updated_at": now,
    }
    get_container().create_item(document)
    return _document_to_conversation(document)


def get_or_create_conversation(
    conversation_id: str | None,
    title_seed: str | None = None,
) -> Conversation:
    if conversation_id:
        conversation = get_conversation(conversation_id)
        if conversation is None:
            raise ValueError("Conversation not found.")
        return conversation
    return create_conversation(title_seed)


def get_conversation(conversation_id: str) -> Conversation | None:
    try:
        document = get_container().read_item(
            item=conversation_id,
            partition_key=conversation_id,
        )
    except CosmosResourceNotFoundError:
        return None
    if document.get("document_type") != CONVERSATION_TYPE:
        return None
    return _document_to_conversation(document)


def get_conversation_messages(conversation_id: str) -> list[ConversationMessage]:
    rows = get_container().query_items(
        query=(
            "SELECT * FROM c WHERE c.document_type = @document_type "
            "ORDER BY c.created_at ASC"
        ),
        parameters=[{"name": "@document_type", "value": MESSAGE_TYPE}],
        partition_key=conversation_id,
    )
    return [_document_to_message(row) for row in rows]


def delete_conversation(conversation_id: str) -> bool:
    if get_conversation(conversation_id) is None:
        return False
    container = get_container()
    for message in get_conversation_messages(conversation_id):
        container.delete_item(item=message.id, partition_key=conversation_id)
    container.delete_item(item=conversation_id, partition_key=conversation_id)
    return True


def get_usage_metrics(
    *,
    days: int,
    model: str | None = None,
    input_token_cost_per_1k: float = 0,
    output_token_cost_per_1k: float = 0,
) -> dict[str, Any]:
    today = datetime.now(UTC).date()
    start_date = today - timedelta(days=days - 1)
    bucket_dates = [start_date + timedelta(days=offset) for offset in range(days)]
    buckets = {
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
    parameters = [
        {"name": "@document_type", "value": MESSAGE_TYPE},
        {"name": "@role", "value": "assistant"},
        {"name": "@start", "value": f"{start_date.isoformat()}T00:00:00+00:00"},
    ]
    model_filter = ""
    if model:
        model_filter = " AND c.model = @model"
        parameters.append({"name": "@model", "value": model})
    rows = get_container().query_items(
        query=(
            "SELECT c.model, c.duration_ms, c.usage, c.created_at FROM c "
            "WHERE c.document_type = @document_type AND c.role = @role "
            "AND IS_DEFINED(c.model) AND NOT IS_NULL(c.model) AND c.created_at >= @start"
            f"{model_filter} ORDER BY c.created_at ASC"
        ),
        parameters=parameters,
        enable_cross_partition_query=True,
    )

    models: set[str] = set()
    request_count = prompt_tokens = completion_tokens = total_tokens = 0
    duration_total = duration_count = 0
    for row in rows:
        bucket = buckets.get(str(row["created_at"])[:10])
        if bucket is None:
            continue
        row_model = row.get("model")
        if row_model:
            models.add(row_model)
        usage = row.get("usage") or {}
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
        duration_ms = row.get("duration_ms")
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
    document = {
        "id": message_id,
        "partition_key": conversation_id,
        "document_type": MESSAGE_TYPE,
        "conversation_id": conversation_id,
        "role": role,
        "content": content,
        "model": model,
        "api_surface": api_surface,
        "duration_ms": duration_ms,
        "error": error,
        "usage": usage,
        "guardrail_variant": guardrail_variant,
        "guardrail_policy_name": guardrail_policy_name,
        "guardrail_results": guardrail_results,
        "created_at": now,
    }
    container = get_container()
    container.execute_item_batch(
        batch_operations=[
            ("create", (document,)),
            (
                "patch",
                (
                    conversation_id,
                    [{"op": "replace", "path": "/updated_at", "value": now}],
                ),
            ),
        ],
        partition_key=conversation_id,
    )
    return _document_to_message(document)


def build_model_history(
    conversation_id: str,
    model: str,
    guardrail_variant: GuardrailVariant | None = None,
) -> list[dict[str, str]]:
    history: list[dict[str, str]] = []
    for message in get_conversation_messages(conversation_id):
        if message.error:
            continue
        if message.role == "user":
            history.append({"role": "user", "content": message.content})
        elif message.model == model and (
            message.guardrail_variant is None
            or message.guardrail_variant == (guardrail_variant or "baseline")
        ):
            history.append({"role": "assistant", "content": message.content})
    return history


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


def _document_to_conversation(document: dict[str, Any]) -> Conversation:
    return Conversation(
        id=document["id"],
        title=document["title"],
        created_at=document["created_at"],
        updated_at=document["updated_at"],
    )


def _document_to_message(document: dict[str, Any]) -> ConversationMessage:
    return ConversationMessage(
        id=document["id"],
        conversation_id=document["conversation_id"],
        role=document["role"],
        content=document["content"],
        model=document.get("model"),
        api_surface=document.get("api_surface"),
        duration_ms=document.get("duration_ms"),
        error=document.get("error"),
        usage=document.get("usage"),
        guardrail_variant=document.get("guardrail_variant"),
        guardrail_policy_name=document.get("guardrail_policy_name"),
        guardrail_results=document.get("guardrail_results"),
        created_at=document["created_at"],
    )


def _usage_value(usage: dict[str, Any], key: str) -> int:
    value = usage.get(key)
    return int(value) if isinstance(value, int | float) else 0
