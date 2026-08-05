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
        conversation = create_conversation(" Local chat ")
        append_message(
            conversation_id=conversation.id,
            role="assistant",
            content="Hello",
            model="gpt-test",
            usage={"total_tokens": 3},
            guardrail_variant="policy_1",
            guardrail_policy_name="strict",
            guardrail_results={"blocked": False},
        )

        messages = get_conversation_messages(conversation.id)
        self.assertEqual(messages[0].usage, {"total_tokens": 3})
        self.assertEqual(messages[0].guardrail_policy_name, "strict")
        self.assertEqual(messages[0].guardrail_results, {"blocked": False})
        self.assertEqual(list_conversations()[0].title, "Local chat")
        self.assertTrue(delete_conversation(conversation.id))

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


if __name__ == "__main__":
    unittest.main()
