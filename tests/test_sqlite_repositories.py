import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from app.conversation_store import (
    append_message,
    create_conversation,
    delete_conversation,
    get_conversation_messages,
    list_conversation_page,
    list_conversations,
)
from app.errors import InvalidRequestError
from app.model_settings import (
    ModelSettings,
    get_model_settings,
    list_models,
    save_model_settings,
)
from app.persistence import initialize_persistence, reset_repositories
from app.persistence_models import Conversation, ConversationMessage
from app.security import UserScope
from app.sqlite_store import SCHEMA_VERSION, SQLiteConversationRepository

USER_SCOPE = UserScope(tenant_id="tenant-1", user_id="user-1")
OTHER_SCOPE = UserScope(tenant_id="tenant-1", user_id="user-2")


class SqliteRepositoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.environment = patch.dict(
            os.environ,
            {
                "PERSISTENCE_BACKEND": "sqlite",
                "SQLITE_DATABASE_PATH": os.path.join(self.temp_dir.name, "test.sqlite3"),
            },
        )
        self.environment.start()
        reset_repositories()
        initialize_persistence()

    def tearDown(self) -> None:
        reset_repositories()
        self.environment.stop()
        self.temp_dir.cleanup()

    def test_conversation_and_guardrail_message_round_trip(self) -> None:
        conversation = create_conversation(USER_SCOPE, " Local chat ")
        append_message(
            scope=USER_SCOPE,
            conversation_id=conversation.id,
            role="assistant",
            content="Hello",
            model="gpt-test",
            usage={"total_tokens": 3},
            guardrail_variant="policy_1",
            guardrail_policy_name="strict",
            guardrail_results={"blocked": False},
        )

        messages = get_conversation_messages(USER_SCOPE, conversation.id)
        self.assertEqual(messages[0].usage, {"total_tokens": 3})
        self.assertEqual(messages[0].guardrail_policy_name, "strict")
        self.assertEqual(messages[0].guardrail_results, {"blocked": False})
        self.assertEqual(list_conversations(USER_SCOPE)[0].title, "Local chat")
        self.assertEqual(list_conversations(OTHER_SCOPE), [])
        self.assertEqual(get_conversation_messages(OTHER_SCOPE, conversation.id), [])
        self.assertFalse(delete_conversation(OTHER_SCOPE, conversation.id))
        self.assertTrue(delete_conversation(USER_SCOPE, conversation.id))

    def test_model_settings_round_trip(self) -> None:
        saved = save_model_settings(
            ModelSettings(
                model="gpt-test",
                modalities=("text", "voice"),
                guardrail_policy_names=("deployment_default", "strict"),
            )
        )

        loaded = get_model_settings(saved.model)
        self.assertEqual(loaded.modalities, ("text", "voice"))
        self.assertEqual(loaded.guardrail_policy_names, ("deployment_default", "strict"))
        self.assertEqual(list_models(), ["gpt-test"])

    def test_conversations_are_filtered_by_use_case(self) -> None:
        legacy_chat = create_conversation(USER_SCOPE, "Chat")
        document_chat = create_conversation(USER_SCOPE, "Documents", use_case="document_qa")

        self.assertEqual(
            [item.id for item in list_conversations(USER_SCOPE, "text_chat")],
            [legacy_chat.id],
        )
        self.assertEqual(
            [item.id for item in list_conversations(USER_SCOPE, "document_qa")],
            [document_chat.id],
        )

    def test_mai_image_model_defaults_to_image_capability(self) -> None:
        settings = get_model_settings("MAI-Image-2.5")

        self.assertEqual(settings.modalities, ("image",))

    def test_flux_model_defaults_to_image_capability(self) -> None:
        settings = get_model_settings("FLUX.2-pro")

        self.assertEqual(settings.modalities, ("image",))

    def test_flux_stale_text_capability_is_corrected(self) -> None:
        save_model_settings(ModelSettings(model="FLUX.2-pro", modalities=("text",)))

        settings = get_model_settings("FLUX.2-pro")

        self.assertEqual(settings.modalities, ("image",))

    def test_conversations_are_paginated_with_stable_cursor(self) -> None:
        repository = SQLiteConversationRepository()
        timestamp = "2026-01-01T00:00:00+00:00"
        conversations = [
            Conversation(
                id=f"conversation-{index}",
                title=f"Chat {index}",
                use_case="text_chat",
                created_at=timestamp,
                updated_at=timestamp,
            )
            for index in range(5)
        ]
        for conversation in conversations:
            repository.create_conversation(USER_SCOPE, conversation)

        first_page = list_conversation_page(USER_SCOPE, limit=2)
        second_page = list_conversation_page(
            USER_SCOPE,
            limit=2,
            cursor=first_page.next_cursor,
        )
        third_page = list_conversation_page(
            USER_SCOPE,
            limit=2,
            cursor=second_page.next_cursor,
        )

        self.assertEqual(len(first_page.conversations), 2)
        self.assertIsNotNone(first_page.next_cursor)
        paged_ids = [
            item.id
            for item in [
                *first_page.conversations,
                *second_page.conversations,
                *third_page.conversations,
            ]
        ]
        self.assertEqual(paged_ids, [item.id for item in conversations])
        self.assertEqual(len(paged_ids), len(set(paged_ids)))
        self.assertIsNone(third_page.next_cursor)

    def test_invalid_conversation_cursor_is_rejected(self) -> None:
        with self.assertRaisesRegex(InvalidRequestError, "Invalid conversation cursor"):
            list_conversation_page(USER_SCOPE, cursor="not-a-cursor")

    def test_schema_mismatch_resets_app_tables(self) -> None:
        conversation = create_conversation(USER_SCOPE, "Will be reset")
        database_path = os.environ["SQLITE_DATABASE_PATH"]
        connection = sqlite3.connect(database_path)
        try:
            connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION - 1}")
            connection.commit()
        finally:
            connection.close()

        with self.assertLogs("app.sqlite_store", level="WARNING") as logs:
            initialize_persistence()

        self.assertEqual(list_conversations(USER_SCOPE), [])
        self.assertIn("development_mvp_reset=true", " ".join(logs.output))
        connection = sqlite3.connect(database_path)
        try:
            version = connection.execute("PRAGMA user_version").fetchone()[0]
        finally:
            connection.close()
        self.assertEqual(version, SCHEMA_VERSION)
        self.assertIsNotNone(conversation.id)

    def test_append_rolls_back_timestamp_when_message_insert_fails(self) -> None:
        repository = SQLiteConversationRepository()
        conversation = Conversation(
            id="conversation-rollback",
            title="Rollback",
            use_case="text_chat",
            created_at="2026-01-01T00:00:00+00:00",
            updated_at="2026-01-01T00:00:00+00:00",
        )
        repository.create_conversation(USER_SCOPE, conversation)
        message = ConversationMessage(
            id="message-1",
            conversation_id=conversation.id,
            role="user",
            content="first",
            model=None,
            api_surface=None,
            duration_ms=None,
            error=None,
            usage=None,
            guardrail_variant=None,
            guardrail_policy_name=None,
            guardrail_results=None,
            created_at="2026-01-02T00:00:00+00:00",
        )
        repository.append_message(USER_SCOPE, message)

        duplicate = ConversationMessage(
            **{
                **message.__dict__,
                "created_at": "2026-01-03T00:00:00+00:00",
            }
        )
        with self.assertRaises(sqlite3.IntegrityError):
            repository.append_message(USER_SCOPE, duplicate)

        stored = repository.get_conversation(USER_SCOPE, conversation.id)
        self.assertIsNotNone(stored)
        assert stored is not None
        self.assertEqual(stored.updated_at, message.created_at)
        self.assertEqual(len(repository.list_messages(USER_SCOPE, conversation.id)), 1)


if __name__ == "__main__":
    unittest.main()
