import uuid
import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from azure.cosmos.exceptions import CosmosResourceNotFoundError

from app.cosmos_store import get_container, initialize_cosmos_store
from app.persistence import persistence_backend
from app.sqlite_store import connect, initialize_sqlite_store
from app.security import UserScope

MessageRole = Literal["user", "assistant"]
GuardrailVariant = Literal["baseline", "guarded", "policy_1", "policy_2"]
CONVERSATION_TYPE = "conversation"
MESSAGE_TYPE = "conversation_message"


@dataclass(frozen=True)
class Conversation:
    id: str
    title: str
    use_case: str
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
    if persistence_backend() == "cosmos":
        initialize_cosmos_store()
    else:
        initialize_sqlite_store()


def list_conversations(scope: UserScope, use_case: str = "text_chat") -> list[Conversation]:
    if persistence_backend() == "sqlite":
        with connect() as connection:
            rows = connection.execute(
                "SELECT * FROM conversations WHERE tenant_id = ? AND owner_id = ? "
                "AND use_case = ? ORDER BY updated_at DESC",
                (scope.tenant_id, scope.user_id, use_case),
            ).fetchall()
        return [_document_to_conversation(dict(row)) for row in rows]
    rows = get_container().query_items(
        query=(
            "SELECT c.id, c.conversation_id, c.title, c.use_case, c.created_at, c.updated_at FROM c "
            "WHERE c.document_type = @document_type AND "
            "c.tenant_id = @tenant_id AND c.owner_id = @owner_id AND "
            "((IS_DEFINED(c.use_case) AND c.use_case = @use_case) OR "
            "(@use_case = 'text_chat' AND NOT IS_DEFINED(c.use_case))) "
            "ORDER BY c.updated_at DESC"
        ),
        parameters=[
            {"name": "@document_type", "value": CONVERSATION_TYPE},
            {"name": "@tenant_id", "value": scope.tenant_id},
            {"name": "@owner_id", "value": scope.user_id},
            {"name": "@use_case", "value": use_case},
        ],
        partition_key=scope.owner_key,
    )
    return [_document_to_conversation(row) for row in rows]


def create_conversation(
    scope: UserScope,
    title: str | None = None,
    use_case: str = "text_chat",
) -> Conversation:
    conversation_id = str(uuid.uuid4())
    now = _utc_now()
    document = {
        "id": _scoped_document_id(scope, conversation_id),
        "conversation_id": conversation_id,
        "partition_key": scope.owner_key,
        "document_type": CONVERSATION_TYPE,
        "tenant_id": scope.tenant_id,
        "owner_id": scope.user_id,
        "title": _normalize_title(title),
        "use_case": use_case,
        "created_at": now,
        "updated_at": now,
    }
    if persistence_backend() == "sqlite":
        with connect() as connection:
            connection.execute(
                "INSERT INTO conversations "
                "(id, tenant_id, owner_id, title, use_case, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    conversation_id, scope.tenant_id, scope.user_id,
                    document["title"], use_case, now, now,
                ),
            )
    else:
        get_container().create_item(document)
    return _document_to_conversation(document)


def get_or_create_conversation(
    scope: UserScope,
    conversation_id: str | None,
    title_seed: str | None = None,
    use_case: str = "text_chat",
) -> Conversation:
    if conversation_id:
        conversation = get_conversation(scope, conversation_id)
        if conversation is None:
            raise ValueError("Conversation not found.")
        if conversation.use_case != use_case:
            raise ValueError("Conversation belongs to a different use case.")
        return conversation
    return create_conversation(scope, title_seed, use_case)


def get_conversation(scope: UserScope, conversation_id: str) -> Conversation | None:
    if persistence_backend() == "sqlite":
        with connect() as connection:
            row = connection.execute(
                "SELECT * FROM conversations WHERE id = ? AND tenant_id = ? AND owner_id = ?",
                (conversation_id, scope.tenant_id, scope.user_id),
            ).fetchone()
        return _document_to_conversation(dict(row)) if row else None
    try:
        document = get_container().read_item(
            item=_scoped_document_id(scope, conversation_id),
            partition_key=scope.owner_key,
        )
    except CosmosResourceNotFoundError:
        return None
    if (
        document.get("document_type") != CONVERSATION_TYPE
        or document.get("tenant_id") != scope.tenant_id
        or document.get("owner_id") != scope.user_id
    ):
        return None
    return _document_to_conversation(document)


def get_conversation_messages(
    scope: UserScope,
    conversation_id: str,
) -> list[ConversationMessage]:
    if persistence_backend() == "sqlite":
        with connect() as connection:
            rows = connection.execute(
                "SELECT * FROM conversation_messages WHERE conversation_id = ? "
                "AND tenant_id = ? AND owner_id = ? ORDER BY created_at ASC, id ASC",
                (conversation_id, scope.tenant_id, scope.user_id),
            ).fetchall()
        return [_sqlite_row_to_message(row) for row in rows]
    rows = get_container().query_items(
        query=(
            "SELECT * FROM c WHERE c.document_type = @document_type "
            "AND c.conversation_id = @conversation_id "
            "ORDER BY c.created_at ASC"
        ),
        parameters=[
            {"name": "@document_type", "value": MESSAGE_TYPE},
            {"name": "@conversation_id", "value": conversation_id},
        ],
        partition_key=scope.owner_key,
    )
    return [_document_to_message(row) for row in rows]


def delete_conversation(scope: UserScope, conversation_id: str) -> bool:
    if persistence_backend() == "sqlite":
        with connect() as connection:
            cursor = connection.execute(
                "DELETE FROM conversations WHERE id = ? AND tenant_id = ? AND owner_id = ?",
                (conversation_id, scope.tenant_id, scope.user_id),
            )
        return cursor.rowcount > 0
    if get_conversation(scope, conversation_id) is None:
        return False
    container = get_container()
    for message in get_conversation_messages(scope, conversation_id):
        container.delete_item(
            item=_scoped_document_id(scope, message.id),
            partition_key=scope.owner_key,
        )
    container.delete_item(
        item=_scoped_document_id(scope, conversation_id),
        partition_key=scope.owner_key,
    )
    return True


def get_usage_metrics(
    *,
    scope: UserScope,
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
    if persistence_backend() == "sqlite":
        query = (
            "SELECT model, duration_ms, usage_json, created_at FROM conversation_messages "
            "WHERE tenant_id = ? AND owner_id = ? AND role = 'assistant' "
            "AND model IS NOT NULL AND created_at >= ?"
        )
        values: list[Any] = [
            scope.tenant_id,
            scope.user_id,
            f"{start_date.isoformat()}T00:00:00+00:00",
        ]
        if model:
            query += " AND model = ?"
            values.append(model)
        query += " ORDER BY created_at ASC"
        with connect() as connection:
            sqlite_rows = connection.execute(query, values).fetchall()
        rows: Any = [
            {**dict(row), "usage": json.loads(row["usage_json"]) if row["usage_json"] else None}
            for row in sqlite_rows
        ]
    else:
        parameters = [
        {"name": "@document_type", "value": MESSAGE_TYPE},
        {"name": "@role", "value": "assistant"},
        {"name": "@start", "value": f"{start_date.isoformat()}T00:00:00+00:00"},
        {"name": "@tenant_id", "value": scope.tenant_id},
        {"name": "@owner_id", "value": scope.user_id},
    ]
        model_filter = ""
        if model:
            model_filter = " AND c.model = @model"
            parameters.append({"name": "@model", "value": model})
        rows = get_container().query_items(
            query=(
                "SELECT c.model, c.duration_ms, c.usage, c.created_at FROM c "
                "WHERE c.document_type = @document_type AND c.role = @role "
                "AND c.tenant_id = @tenant_id AND c.owner_id = @owner_id "
                "AND IS_DEFINED(c.model) AND NOT IS_NULL(c.model) AND c.created_at >= @start"
                f"{model_filter} ORDER BY c.created_at ASC"
            ),
            parameters=parameters,
            partition_key=scope.owner_key,
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
    document = {
        "id": _scoped_document_id(scope, message_id),
        "message_id": message_id,
        "partition_key": scope.owner_key,
        "document_type": MESSAGE_TYPE,
        "tenant_id": scope.tenant_id,
        "owner_id": scope.user_id,
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
    if persistence_backend() == "sqlite":
        with connect() as connection:
            connection.execute(
                """
                INSERT INTO conversation_messages (
                    id, conversation_id, tenant_id, owner_id, role, content, model, api_surface, duration_ms, error,
                    usage_json, guardrail_variant, guardrail_policy_name, guardrail_results_json,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    message_id, conversation_id, scope.tenant_id, scope.user_id,
                    role, content, model, api_surface, duration_ms,
                    error, json.dumps(usage) if usage is not None else None, guardrail_variant,
                    guardrail_policy_name,
                    json.dumps(guardrail_results) if guardrail_results is not None else None, now,
                ),
            )
            connection.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ? "
                "AND tenant_id = ? AND owner_id = ?",
                (now, conversation_id, scope.tenant_id, scope.user_id),
            )
    else:
        container = get_container()
        container.execute_item_batch(
        batch_operations=[
            ("create", (document,)),
            (
                "patch",
                (
                    _scoped_document_id(scope, conversation_id),
                    [{"op": "replace", "path": "/updated_at", "value": now}],
                ),
            ),
        ],
        partition_key=scope.owner_key,
    )
    return _document_to_message(document)


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


def _document_to_conversation(document: dict[str, Any]) -> Conversation:
    return Conversation(
        id=document.get("conversation_id") or document["id"],
        title=document["title"],
        use_case=document.get("use_case") or "text_chat",
        created_at=document["created_at"],
        updated_at=document["updated_at"],
    )


def _document_to_message(document: dict[str, Any]) -> ConversationMessage:
    return ConversationMessage(
        id=document.get("message_id") or document["id"],
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


def _sqlite_row_to_message(row: Any) -> ConversationMessage:
    document = dict(row)
    document["usage"] = json.loads(document.pop("usage_json")) if document["usage_json"] else None
    document["guardrail_results"] = (
        json.loads(document.pop("guardrail_results_json"))
        if document["guardrail_results_json"]
        else None
    )
    return _document_to_message(document)


def _usage_value(usage: dict[str, Any], key: str) -> int:
    value = usage.get(key)
    return int(value) if isinstance(value, int | float) else 0


def _scoped_document_id(scope: UserScope, document_id: str) -> str:
    return f"{scope.owner_key}:{document_id}"
