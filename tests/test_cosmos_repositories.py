import os
import unittest
from unittest.mock import MagicMock, patch

from azure.cosmos.exceptions import CosmosResourceNotFoundError

from app.conversation_store import (
    append_message,
    create_conversation,
    get_conversation,
    list_conversations,
)
from app.model_settings import ModelSettings, get_model_settings, save_model_settings
from app.persistence import reset_repositories
from app.security import UserScope


USER_SCOPE = UserScope(tenant_id="tenant-1", user_id="user-1")


class ConversationStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.environment = patch.dict(os.environ, {"PERSISTENCE_BACKEND": "cosmos"})
        self.environment.start()
        reset_repositories()

    def tearDown(self) -> None:
        reset_repositories()
        self.environment.stop()

    @patch("app.cosmos_store.get_container")
    def test_create_conversation_uses_conversation_partition(self, get_container: MagicMock) -> None:
        conversation = create_conversation(USER_SCOPE, "  A   useful chat  ")

        document = get_container.return_value.create_item.call_args.args[0]
        self.assertEqual(document["conversation_id"], conversation.id)
        self.assertTrue(document["id"].endswith(conversation.id))
        self.assertEqual(document["partition_key"], USER_SCOPE.owner_key)
        self.assertEqual(document["tenant_id"], USER_SCOPE.tenant_id)
        self.assertEqual(document["owner_id"], USER_SCOPE.user_id)
        self.assertEqual(document["document_type"], "conversation")
        self.assertEqual(conversation.title, "A useful chat")

    @patch("app.cosmos_store.get_container")
    def test_append_message_updates_conversation_atomically(self, get_container: MagicMock) -> None:
        message = append_message(
            scope=USER_SCOPE,
            conversation_id="conversation-1",
            role="assistant",
            content="Hello",
            model="gpt-test",
            usage={"total_tokens": 3},
        )

        call = get_container.return_value.execute_item_batch.call_args
        self.assertEqual(call.kwargs["partition_key"], USER_SCOPE.owner_key)
        operations = call.kwargs["batch_operations"]
        self.assertEqual(operations[0][0], "create")
        self.assertEqual(operations[0][1][0]["partition_key"], USER_SCOPE.owner_key)
        self.assertEqual(operations[1][0], "patch")
        self.assertTrue(operations[1][1][0].endswith("conversation-1"))
        self.assertEqual(message.conversation_id, "conversation-1")

    @patch("app.cosmos_store.get_container")
    def test_get_missing_conversation_returns_none(self, get_container: MagicMock) -> None:
        get_container.return_value.read_item.side_effect = CosmosResourceNotFoundError()
        self.assertIsNone(get_conversation(USER_SCOPE, "missing"))

    @patch("app.cosmos_store.get_container")
    def test_list_conversations_returns_public_id_and_scopes_query(
        self,
        get_container: MagicMock,
    ) -> None:
        get_container.return_value.query_items.return_value = [
            {
                "id": "tenant-1:user-1:conversation-1",
                "conversation_id": "conversation-1",
                "title": "Scoped chat",
                "use_case": "text_chat",
                "created_at": "2026-01-01T00:00:00+00:00",
                "updated_at": "2026-01-01T00:00:00+00:00",
            }
        ]

        conversations = list_conversations(USER_SCOPE)

        self.assertEqual(conversations[0].id, "conversation-1")
        self.assertEqual(
            get_container.return_value.query_items.call_args.kwargs["partition_key"],
            USER_SCOPE.owner_key,
        )


class ModelSettingsStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.environment = patch.dict(os.environ, {"PERSISTENCE_BACKEND": "cosmos"})
        self.environment.start()
        reset_repositories()

    def tearDown(self) -> None:
        reset_repositories()
        self.environment.stop()

    @patch("app.cosmos_store.get_container")
    def test_missing_settings_return_model_defaults(self, get_container: MagicMock) -> None:
        get_container.return_value.read_item.side_effect = CosmosResourceNotFoundError()
        settings = get_model_settings("Kimi-K2.5")
        self.assertEqual(settings.api_surface, "chat_completions")
        self.assertEqual(settings.modalities, ("text",))

    @patch("app.cosmos_store.get_container")
    def test_save_settings_uses_model_settings_partition(self, get_container: MagicMock) -> None:
        settings = save_model_settings(ModelSettings(model="gpt-test", modalities=("text", "voice")))
        document = get_container.return_value.upsert_item.call_args.args[0]
        self.assertEqual(document["partition_key"], "model-settings")
        self.assertEqual(document["document_type"], "model_settings")
        self.assertEqual(document["modalities"], ["text", "voice"])
        self.assertEqual(settings.model, "gpt-test")


if __name__ == "__main__":
    unittest.main()
