import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from collections.abc import Iterator
from typing import Any

from app.persistence_models import (
    Conversation,
    ConversationMessage,
    ModelSettings,
    conversation_from_record,
    message_from_record,
    settings_from_record,
)
from app.config import env_text
from app.repository_contracts import UsageRecord
from app.security import UserScope


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATABASE_PATH = PROJECT_ROOT / "data" / "foundry_chat.sqlite3"


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    database_path = Path(
        env_text("SQLITE_DATABASE_PATH", str(DEFAULT_DATABASE_PATH)) or DEFAULT_DATABASE_PATH
    )
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA foreign_keys=ON")
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def initialize_sqlite_store() -> None:
    with connect() as connection:
        schema_version = connection.execute("PRAGMA user_version").fetchone()[0]
        if schema_version != 2:
            connection.executescript(
                """
                DROP TABLE IF EXISTS conversation_messages;
                DROP TABLE IF EXISTS conversations;
                DROP TABLE IF EXISTS model_settings;
                """
            )
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                owner_id TEXT NOT NULL,
                title TEXT NOT NULL,
                use_case TEXT NOT NULL DEFAULT 'text_chat',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS conversation_messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL,
                owner_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                model TEXT,
                api_surface TEXT,
                duration_ms INTEGER,
                error TEXT,
                usage_json TEXT,
                guardrail_variant TEXT,
                guardrail_policy_name TEXT,
                guardrail_results_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
                ON conversation_messages(tenant_id, owner_id, conversation_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_conversations_owner_updated
                ON conversations(tenant_id, owner_id, use_case, updated_at DESC);
            CREATE TABLE IF NOT EXISTS model_settings (
                model TEXT PRIMARY KEY,
                api_surface TEXT NOT NULL DEFAULT 'responses',
                modalities_json TEXT NOT NULL DEFAULT '["text"]',
                system_prompt TEXT NOT NULL,
                temperature REAL NOT NULL,
                top_p REAL NOT NULL,
                max_tokens INTEGER NOT NULL,
                repetition_penalty REAL NOT NULL,
                guardrail_policy_names_json TEXT NOT NULL DEFAULT '[]',
                updated_at TEXT NOT NULL
            );
            """
        )
        connection.execute("PRAGMA user_version = 2")


def check_sqlite_store() -> None:
    with connect() as connection:
        connection.execute("SELECT 1").fetchone()


class SQLiteConversationRepository:
    def list_conversations(
        self,
        scope: UserScope,
        use_case: str,
        limit: int,
        offset: int,
    ) -> list[Conversation]:
        with connect() as connection:
            rows = connection.execute(
                "SELECT * FROM conversations WHERE tenant_id = ? AND owner_id = ? "
                "AND use_case = ? ORDER BY updated_at DESC, id ASC LIMIT ? OFFSET ?",
                (scope.tenant_id, scope.user_id, use_case, limit, offset),
            ).fetchall()
        return [conversation_from_record(dict(row)) for row in rows]

    def create_conversation(self, scope: UserScope, conversation: Conversation) -> None:
        with connect() as connection:
            connection.execute(
                "INSERT INTO conversations "
                "(id, tenant_id, owner_id, title, use_case, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    conversation.id,
                    scope.tenant_id,
                    scope.user_id,
                    conversation.title,
                    conversation.use_case,
                    conversation.created_at,
                    conversation.updated_at,
                ),
            )

    def get_conversation(
        self,
        scope: UserScope,
        conversation_id: str,
    ) -> Conversation | None:
        with connect() as connection:
            row = connection.execute(
                "SELECT * FROM conversations WHERE id = ? AND tenant_id = ? AND owner_id = ?",
                (conversation_id, scope.tenant_id, scope.user_id),
            ).fetchone()
        return conversation_from_record(dict(row)) if row else None

    def list_messages(
        self,
        scope: UserScope,
        conversation_id: str,
    ) -> list[ConversationMessage]:
        with connect() as connection:
            rows = connection.execute(
                "SELECT * FROM conversation_messages WHERE conversation_id = ? "
                "AND tenant_id = ? AND owner_id = ? ORDER BY created_at ASC, id ASC",
                (conversation_id, scope.tenant_id, scope.user_id),
            ).fetchall()
        messages: list[ConversationMessage] = []
        for row in rows:
            record = dict(row)
            record["usage"] = (
                json.loads(record.pop("usage_json")) if record["usage_json"] else None
            )
            record["guardrail_results"] = (
                json.loads(record.pop("guardrail_results_json"))
                if record["guardrail_results_json"]
                else None
            )
            messages.append(message_from_record(record))
        return messages

    def append_message(self, scope: UserScope, message: ConversationMessage) -> None:
        with connect() as connection:
            connection.execute(
                """
                INSERT INTO conversation_messages (
                    id, conversation_id, tenant_id, owner_id, role, content, model, api_surface,
                    duration_ms, error, usage_json, guardrail_variant, guardrail_policy_name,
                    guardrail_results_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    message.id,
                    message.conversation_id,
                    scope.tenant_id,
                    scope.user_id,
                    message.role,
                    message.content,
                    message.model,
                    message.api_surface,
                    message.duration_ms,
                    message.error,
                    json.dumps(message.usage) if message.usage is not None else None,
                    message.guardrail_variant,
                    message.guardrail_policy_name,
                    json.dumps(message.guardrail_results)
                    if message.guardrail_results is not None
                    else None,
                    message.created_at,
                ),
            )
            connection.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ? "
                "AND tenant_id = ? AND owner_id = ?",
                (message.created_at, message.conversation_id, scope.tenant_id, scope.user_id),
            )

    def delete_conversation(self, scope: UserScope, conversation_id: str) -> bool:
        with connect() as connection:
            cursor = connection.execute(
                "DELETE FROM conversations WHERE id = ? AND tenant_id = ? AND owner_id = ?",
                (conversation_id, scope.tenant_id, scope.user_id),
            )
        return cursor.rowcount > 0

    def list_usage(
        self,
        scope: UserScope,
        start_at: str,
        model: str | None,
    ) -> list[UsageRecord]:
        query = (
            "SELECT model, duration_ms, usage_json, created_at FROM conversation_messages "
            "WHERE tenant_id = ? AND owner_id = ? AND role = 'assistant' "
            "AND model IS NOT NULL AND created_at >= ?"
        )
        values: list[Any] = [scope.tenant_id, scope.user_id, start_at]
        if model:
            query += " AND model = ?"
            values.append(model)
        query += " ORDER BY created_at ASC, id ASC"
        with connect() as connection:
            rows = connection.execute(query, values).fetchall()
        return [
            UsageRecord(
                model=row["model"],
                duration_ms=row["duration_ms"],
                usage=json.loads(row["usage_json"]) if row["usage_json"] else None,
                created_at=row["created_at"],
            )
            for row in rows
        ]


class SQLiteModelSettingsRepository:
    def list_models(self) -> list[str]:
        with connect() as connection:
            rows = connection.execute(
                "SELECT model FROM model_settings ORDER BY lower(model), model"
            ).fetchall()
        return [row["model"] for row in rows]

    def get_settings(self, model: str) -> ModelSettings | None:
        with connect() as connection:
            row = connection.execute(
                "SELECT * FROM model_settings WHERE model = ?",
                (model,),
            ).fetchone()
        if row is None:
            return None
        record = dict(row)
        record["modalities"] = json.loads(record.pop("modalities_json"))
        record["guardrail_policy_names"] = json.loads(
            record.pop("guardrail_policy_names_json")
        )
        return settings_from_record(record)

    def add_settings_if_absent(self, settings: ModelSettings) -> None:
        with connect() as connection:
            connection.execute(
                """
                INSERT OR IGNORE INTO model_settings (
                    model, api_surface, modalities_json, system_prompt, temperature, top_p,
                    max_tokens, repetition_penalty, guardrail_policy_names_json, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                _settings_values(settings),
            )

    def save_settings(self, settings: ModelSettings) -> None:
        with connect() as connection:
            connection.execute(
                """
                INSERT INTO model_settings (
                    model, api_surface, modalities_json, system_prompt, temperature, top_p,
                    max_tokens, repetition_penalty, guardrail_policy_names_json, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(model) DO UPDATE SET
                    api_surface = excluded.api_surface,
                    modalities_json = excluded.modalities_json,
                    system_prompt = excluded.system_prompt,
                    temperature = excluded.temperature,
                    top_p = excluded.top_p,
                    max_tokens = excluded.max_tokens,
                    repetition_penalty = excluded.repetition_penalty,
                    guardrail_policy_names_json = excluded.guardrail_policy_names_json,
                    updated_at = excluded.updated_at
                """,
                _settings_values(settings),
            )


def _settings_values(settings: ModelSettings) -> tuple[Any, ...]:
    from datetime import UTC, datetime

    return (
        settings.model,
        settings.api_surface,
        json.dumps(settings.modalities),
        settings.system_prompt,
        settings.temperature,
        settings.top_p,
        settings.max_tokens,
        settings.repetition_penalty,
        json.dumps(settings.guardrail_policy_names),
        datetime.now(UTC).isoformat(),
    )
