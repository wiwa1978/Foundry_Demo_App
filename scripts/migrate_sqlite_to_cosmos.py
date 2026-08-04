import argparse
import json
import sqlite3
import sys
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from app.cosmos_store import get_container
from app.model_settings import MODEL_SETTINGS_PARTITION, MODEL_SETTINGS_TYPE, _model_document_id

DEFAULT_DATABASE_PATH = PROJECT_ROOT / "data" / "foundry_chat.sqlite3"


def migrate(database_path: Path) -> dict[str, int]:
    if not database_path.exists():
        raise FileNotFoundError(f"SQLite database not found: {database_path}")

    counts = {"conversations": 0, "messages": 0, "model_settings": 0}
    container = get_container()
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    try:
        for row in connection.execute("SELECT * FROM conversations"):
            container.upsert_item(
                {
                    "id": row["id"],
                    "partition_key": row["id"],
                    "document_type": "conversation",
                    "title": row["title"],
                    "created_at": _normalize_timestamp(row["created_at"]),
                    "updated_at": _normalize_timestamp(row["updated_at"]),
                }
            )
            counts["conversations"] += 1

        message_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(conversation_messages)")
        }
        has_api_surface = "api_surface" in message_columns
        for row in connection.execute("SELECT * FROM conversation_messages"):
            container.upsert_item(
                {
                    "id": row["id"],
                    "partition_key": row["conversation_id"],
                    "document_type": "conversation_message",
                    "conversation_id": row["conversation_id"],
                    "role": row["role"],
                    "content": row["content"],
                    "model": row["model"],
                    "api_surface": row["api_surface"] if has_api_surface else None,
                    "duration_ms": row["duration_ms"],
                    "error": row["error"],
                    "usage": json.loads(row["usage_json"]) if row["usage_json"] else None,
                    "created_at": _normalize_timestamp(row["created_at"]),
                }
            )
            counts["messages"] += 1

        model_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(model_settings)")
        }
        for row in connection.execute("SELECT * FROM model_settings"):
            model = row["model"]
            modalities = (
                json.loads(row["modalities_json"])
                if "modalities_json" in model_columns and row["modalities_json"]
                else ["text"]
            )
            container.upsert_item(
                {
                    "id": _model_document_id(model),
                    "partition_key": MODEL_SETTINGS_PARTITION,
                    "document_type": MODEL_SETTINGS_TYPE,
                    "model": model,
                    "api_surface": row["api_surface"]
                    if "api_surface" in model_columns
                    else "responses",
                    "modalities": modalities,
                    "system_prompt": row["system_prompt"],
                    "temperature": row["temperature"],
                    "top_p": row["top_p"],
                    "max_tokens": row["max_tokens"],
                    "repetition_penalty": row["repetition_penalty"],
                    "updated_at": _normalize_timestamp(row["updated_at"]),
                }
            )
            counts["model_settings"] += 1
    finally:
        connection.close()
    return counts


def _normalize_timestamp(value: str) -> str:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).isoformat()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate Foundry Chat SQLite data to Cosmos DB.")
    parser.add_argument("--database-path", type=Path, default=DEFAULT_DATABASE_PATH)
    args = parser.parse_args()
    load_dotenv()
    migrated = migrate(args.database_path)
    print(
        "Migration complete: "
        f"{migrated['conversations']} conversations, "
        f"{migrated['messages']} messages, "
        f"{migrated['model_settings']} model settings."
    )
