import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from collections.abc import Iterator


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATABASE_PATH = PROJECT_ROOT / "data" / "foundry_chat.sqlite3"


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    database_path = Path(os.getenv("SQLITE_DATABASE_PATH", str(DEFAULT_DATABASE_PATH)))
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
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS conversation_messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
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
                ON conversation_messages(conversation_id, created_at);
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
        _add_missing_columns(connection, "conversation_messages", {
            "guardrail_variant": "TEXT",
            "guardrail_policy_name": "TEXT",
            "guardrail_results_json": "TEXT",
        })
        _add_missing_columns(connection, "model_settings", {
            "api_surface": "TEXT NOT NULL DEFAULT 'responses'",
            "modalities_json": "TEXT NOT NULL DEFAULT '[\"text\"]'",
            "guardrail_policy_names_json": "TEXT NOT NULL DEFAULT '[]'",
        })


def _add_missing_columns(
    connection: sqlite3.Connection,
    table: str,
    columns: dict[str, str],
) -> None:
    existing = {row["name"] for row in connection.execute(f"PRAGMA table_info({table})")}
    for name, definition in columns.items():
        if name not in existing:
            connection.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")
