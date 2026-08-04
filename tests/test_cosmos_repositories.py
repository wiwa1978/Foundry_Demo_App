import unittest
from unittest.mock import MagicMock, patch

from azure.cosmos.exceptions import CosmosResourceNotFoundError

from app.conversation_store import append_message, create_conversation, get_conversation
from app.model_settings import ModelSettings, get_model_settings, save_model_settings


class ConversationStoreTests(unittest.TestCase):
    @patch("app.conversation_store.get_container")
    def test_create_conversation_uses_conversation_partition(self, get_container: MagicMock) -> None:
        conversation = create_conversation("  A   useful chat  ")

        document = get_container.return_value.create_item.call_args.args[0]
        self.assertEqual(document["id"], conversation.id)
        self.assertEqual(document["partition_key"], conversation.id)
        self.assertEqual(document["document_type"], "conversation")
        self.assertEqual(conversation.title, "A useful chat")

    @patch("app.conversation_store.get_container")
    def test_append_message_updates_conversation_atomically(self, get_container: MagicMock) -> None:
        message = append_message(
            conversation_id="conversation-1",
            role="assistant",
            content="Hello",
            model="gpt-test",
            usage={"total_tokens": 3},
        )

        call = get_container.return_value.execute_item_batch.call_args
        self.assertEqual(call.kwargs["partition_key"], "conversation-1")
        operations = call.kwargs["batch_operations"]
        self.assertEqual(operations[0][0], "create")
        self.assertEqual(operations[0][1][0]["partition_key"], "conversation-1")
        self.assertEqual(operations[1][0], "patch")
        self.assertEqual(message.conversation_id, "conversation-1")

    @patch("app.conversation_store.get_container")
    def test_get_missing_conversation_returns_none(self, get_container: MagicMock) -> None:
        get_container.return_value.read_item.side_effect = CosmosResourceNotFoundError()
        self.assertIsNone(get_conversation("missing"))


class ModelSettingsStoreTests(unittest.TestCase):
    @patch("app.model_settings.get_container")
    def test_missing_settings_return_model_defaults(self, get_container: MagicMock) -> None:
        get_container.return_value.read_item.side_effect = CosmosResourceNotFoundError()
        settings = get_model_settings("Kimi-K2.5")
        self.assertEqual(settings.api_surface, "chat_completions")
        self.assertEqual(settings.modalities, ("text",))

    @patch("app.model_settings.get_container")
    def test_save_settings_uses_model_settings_partition(self, get_container: MagicMock) -> None:
        settings = save_model_settings(ModelSettings(model="gpt-test", modalities=("text", "voice")))
        document = get_container.return_value.upsert_item.call_args.args[0]
        self.assertEqual(document["partition_key"], "model-settings")
        self.assertEqual(document["document_type"], "model_settings")
        self.assertEqual(document["modalities"], ["text", "voice"])
        self.assertEqual(settings.model, "gpt-test")


if __name__ == "__main__":
    unittest.main()
