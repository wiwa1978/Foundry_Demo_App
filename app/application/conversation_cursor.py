import base64
import binascii
import json
from datetime import datetime

from app.application.ports.conversations import ConversationPageKey
from app.core.errors import InvalidRequestError
from app.domain.models import Conversation

CURSOR_VERSION = 1


def encode_cursor(conversation: Conversation) -> str:
    payload = json.dumps(
        {"v": CURSOR_VERSION, "updated_at": conversation.updated_at, "id": conversation.id},
        separators=(",", ":"),
        sort_keys=True,
    )
    return base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii").rstrip("=")


def decode_cursor(cursor: str | None) -> ConversationPageKey | None:
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
