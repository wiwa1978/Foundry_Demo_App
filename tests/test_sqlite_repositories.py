import os
import tempfile
import unittest
from unittest.mock import patch

from app.conversation_store import (
    append_message,
    create_conversation,
    delete_conversation,
    get_conversation_messages,
    initialize_conversation_database,
    list_conversations,
)
from app.model_settings import (
    ModelSettings,
    get_model_settings,
    initialize_database,
    list_models,
    save_model_settings,
)
from app.security import UserScope


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
        initialize_database()
        initialize_conversation_database()

    def tearDown(self) -> None:
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


if __name__ == "__main__":
    unittest.main()
