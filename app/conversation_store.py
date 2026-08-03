import json
import sqlite3
import uuid
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from typing import Any, Literal

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DATABASE_PATH = DATA_DIR / "foundry_chat.sqlite3"

MessageRole = Literal["user", "assistant"]


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
    created_at: str


def initialize_conversation_database() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    with _connect() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS conversation_messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
                content TEXT NOT NULL,
                model TEXT,
                api_surface TEXT,
                duration_ms INTEGER,
                error TEXT,
                usage_json TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id)
            )
            """
        )
        columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(conversation_messages)").fetchall()
        }
        if "api_surface" not in columns:
            connection.execute("ALTER TABLE conversation_messages ADD COLUMN api_surface TEXT")
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_created
            ON conversation_messages(conversation_id, created_at)
            """
        )


def list_conversations() -> list[Conversation]:
    initialize_conversation_database()
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT id, title, created_at, updated_at
            FROM conversations
            ORDER BY updated_at DESC
            """
        ).fetchall()
    return [_row_to_conversation(row) for row in rows]


def create_conversation(title: str | None = None) -> Conversation:
    initialize_conversation_database()
    conversation_id = str(uuid.uuid4())
    conversation_title = _normalize_title(title)
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO conversations (id, title)
            VALUES (?, ?)
            """,
            (conversation_id, conversation_title),
        )
        row = connection.execute(
            """
            SELECT id, title, created_at, updated_at
            FROM conversations
            WHERE id = ?
            """,
            (conversation_id,),
        ).fetchone()
    return _row_to_conversation(row)


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
    initialize_conversation_database()
    with _connect() as connection:
        row = connection.execute(
            """
            SELECT id, title, created_at, updated_at
            FROM conversations
            WHERE id = ?
            """,
            (conversation_id,),
        ).fetchone()
    return _row_to_conversation(row) if row else None


def get_conversation_messages(conversation_id: str) -> list[ConversationMessage]:
    initialize_conversation_database()
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT id, conversation_id, role, content, model, api_surface, duration_ms, error, usage_json, created_at
            FROM conversation_messages
            WHERE conversation_id = ?
            ORDER BY created_at ASC, rowid ASC
            """,
            (conversation_id,),
        ).fetchall()
    return [_row_to_message(row) for row in rows]


def delete_conversation(conversation_id: str) -> bool:
    initialize_conversation_database()
    with _connect() as connection:
        conversation = connection.execute(
            "SELECT id FROM conversations WHERE id = ?",
            (conversation_id,),
        ).fetchone()
        if conversation is None:
            return False
        connection.execute(
            "DELETE FROM conversation_messages WHERE conversation_id = ?",
            (conversation_id,),
        )
        connection.execute(
            "DELETE FROM conversations WHERE id = ?",
            (conversation_id,),
        )
    return True


def get_usage_metrics(
    *,
    days: int,
    model: str | None = None,
    input_token_cost_per_1k: float = 0,
    output_token_cost_per_1k: float = 0,
) -> dict[str, Any]:
    initialize_conversation_database()
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
    models: set[str] = set()
    request_count = 0
    prompt_tokens = 0
    completion_tokens = 0
    total_tokens = 0
    duration_total = 0
    duration_count = 0

    start_timestamp = datetime.combine(start_date, time.min, tzinfo=UTC).strftime(
        "%Y-%m-%d %H:%M:%S"
    )
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT model, duration_ms, usage_json, created_at
            FROM conversation_messages
            WHERE role = 'assistant'
              AND model IS NOT NULL
              AND created_at >= ?
              AND (? IS NULL OR model = ?)
            ORDER BY created_at ASC, rowid ASC
            """,
            (start_timestamp, model, model),
        ).fetchall()

    for row in rows:
        day = _message_day(row["created_at"])
        bucket = buckets.get(day)
        if bucket is None:
            continue

        row_model = row["model"]
        if row_model:
            models.add(row_model)

        usage = json.loads(row["usage_json"]) if row["usage_json"] else {}
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

        duration_ms = row["duration_ms"]
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
) -> ConversationMessage:
    initialize_conversation_database()
    message_id = str(uuid.uuid4())
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO conversation_messages (
                id,
                conversation_id,
                role,
                content,
                model,
                api_surface,
                duration_ms,
                error,
                usage_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                message_id,
                conversation_id,
                role,
                content,
                model,
                api_surface,
                duration_ms,
                error,
                json.dumps(usage) if usage else None,
            ),
        )
        connection.execute(
            """
            UPDATE conversations
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (conversation_id,),
        )
        row = connection.execute(
            """
            SELECT id, conversation_id, role, content, model, api_surface, duration_ms, error, usage_json, created_at
            FROM conversation_messages
            WHERE id = ?
            """,
            (message_id,),
        ).fetchone()
    return _row_to_message(row)


def build_model_history(conversation_id: str, model: str) -> list[dict[str, str]]:
    messages = get_conversation_messages(conversation_id)
    history: list[dict[str, str]] = []
    for message in messages:
        if message.error:
            continue
        if message.role == "user":
            history.append({"role": "user", "content": message.content})
        elif message.model == model:
            history.append({"role": "assistant", "content": message.content})
    return history


def conversation_to_dict(conversation: Conversation) -> dict[str, Any]:
    return asdict(conversation)


def message_to_dict(message: ConversationMessage) -> dict[str, Any]:
    return asdict(message)


def _connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def _normalize_title(title: str | None) -> str:
    if not title or not title.strip():
        return "New chat"
    normalized = " ".join(title.strip().split())
    if len(normalized) <= 60:
        return normalized
    return f"{normalized[:57]}..."


def _row_to_conversation(row: sqlite3.Row) -> Conversation:
    return Conversation(
        id=row["id"],
        title=row["title"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_message(row: sqlite3.Row) -> ConversationMessage:
    usage_json = row["usage_json"]
    return ConversationMessage(
        id=row["id"],
        conversation_id=row["conversation_id"],
        role=row["role"],
        content=row["content"],
        model=row["model"],
        api_surface=row["api_surface"],
        duration_ms=row["duration_ms"],
        error=row["error"],
        usage=json.loads(usage_json) if usage_json else None,
        created_at=row["created_at"],
    )


def _message_day(created_at: str) -> str:
    return created_at[:10]


def _usage_value(usage: dict[str, Any], key: str) -> int:
    value = usage.get(key)
    if isinstance(value, int | float):
        return int(value)
    return 0
