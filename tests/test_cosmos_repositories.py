import os
import unittest
from unittest.mock import MagicMock, patch

from azure.cosmos.exceptions import (
    CosmosBatchOperationError,
    CosmosResourceNotFoundError,
)

from app.application.conversations import (
    append_message,
    create_conversation,
    delete_conversation,
    get_conversation,
    list_conversations,
)
from app.application.models import ModelSettings, get_model_settings, save_model_settings
from app.core.errors import InvalidRequestError
from app.domain.identity import UserScope
from app.infrastructure.persistence.cosmos import CONTAINER_SCHEMA_VERSION, get_container
from app.infrastructure.persistence.registry import reset_repositories

USER_SCOPE = UserScope(tenant_id="tenant-1", user_id="user-1")
OTHER_SCOPE = UserScope(tenant_id="tenant-1", user_id="user-2")


class ConversationStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.environment = patch.dict(os.environ, {"PERSISTENCE_BACKEND": "cosmos"})
        self.environment.start()
        reset_repositories()

    def tearDown(self) -> None:
        reset_repositories()
        self.environment.stop()

    @patch("app.infrastructure.persistence.cosmos.get_container")
    def test_create_conversation_uses_conversation_partition(self, get_container: MagicMock) -> None:
        conversation = create_conversation(USER_SCOPE, "  A   useful chat  ")

        document = get_container.return_value.create_item.call_args.args[0]
        self.assertEqual(document["conversation_id"], conversation.id)
        self.assertTrue(document["id"].endswith(conversation.id))
        self.assertEqual(document["partition_key"], USER_SCOPE.owner_key)
        self.assertEqual(document["tenant_id"], USER_SCOPE.tenant_id)
        self.assertEqual(document["owner_id"], USER_SCOPE.user_id)
        self.assertEqual(document["document_type"], "conversation")
        self.assertEqual(document["state"], "active")
        self.assertEqual(conversation.title, "A useful chat")

    @patch("app.infrastructure.persistence.cosmos.get_container")
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
        self.assertEqual(
            operations[1][2]["filter_predicate"],
            'FROM c WHERE c.state = "active"',
        )
        self.assertEqual(message.conversation_id, "conversation-1")

    @patch("app.infrastructure.persistence.cosmos.get_container")
    def test_append_message_does_not_survive_deleting_parent(
        self,
        get_container: MagicMock,
    ) -> None:
        get_container.return_value.execute_item_batch.side_effect = CosmosBatchOperationError(
            error_index=1,
            headers={},
            status_code=412,
            message="condition failed",
            operation_responses=[],
        )

        with self.assertRaisesRegex(InvalidRequestError, "being deleted"):
            append_message(
                scope=USER_SCOPE,
                conversation_id="conversation-1",
                role="user",
                content="Too late",
            )

        operations = get_container.return_value.execute_item_batch.call_args.kwargs[
            "batch_operations"
        ]
        self.assertEqual([operation[0] for operation in operations], ["create", "patch"])

    @patch("app.infrastructure.persistence.cosmos.get_container")
    def test_get_missing_conversation_returns_none(self, get_container: MagicMock) -> None:
        get_container.return_value.read_item.side_effect = CosmosResourceNotFoundError()
        self.assertIsNone(get_conversation(USER_SCOPE, "missing"))

    @patch("app.infrastructure.persistence.cosmos.get_container")
    def test_get_conversation_rejects_cross_user_document(
        self,
        get_container: MagicMock,
    ) -> None:
        get_container.return_value.read_item.return_value = {
            "id": "tenant-1:user-1:conversation-1",
            "conversation_id": "conversation-1",
            "document_type": "conversation",
            "tenant_id": USER_SCOPE.tenant_id,
            "owner_id": USER_SCOPE.user_id,
            "state": "active",
            "title": "Private",
            "use_case": "text_chat",
            "created_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-01-01T00:00:00+00:00",
        }

        self.assertIsNone(get_conversation(OTHER_SCOPE, "conversation-1"))
        self.assertEqual(
            get_container.return_value.read_item.call_args.kwargs["partition_key"],
            OTHER_SCOPE.owner_key,
        )

    @patch("app.infrastructure.persistence.cosmos.get_container")
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

    @patch("app.infrastructure.persistence.cosmos.get_container")
    def test_delete_conversation_batches_more_than_100_messages(
        self,
        get_container: MagicMock,
    ) -> None:
        container = get_container.return_value
        container.read_item.return_value = {
            "id": "tenant-1:user-1:conversation-1",
            "conversation_id": "conversation-1",
            "document_type": "conversation",
            "tenant_id": USER_SCOPE.tenant_id,
            "owner_id": USER_SCOPE.user_id,
            "state": "active",
            "title": "Delete me",
            "use_case": "text_chat",
            "created_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-01-01T00:00:00+00:00",
        }
        container.query_items.return_value = [f"message-{index}" for index in range(205)]

        self.assertTrue(delete_conversation(USER_SCOPE, "conversation-1"))

        self.assertEqual(container.query_items.call_count, 1)
        container.patch_item.assert_called_once_with(
            item="tenant-1:user-1:conversation-1",
            partition_key=USER_SCOPE.owner_key,
            patch_operations=[
                {"op": "replace", "path": "/state", "value": "deleting"}
            ],
            filter_predicate='FROM c WHERE c.state = "active"',
        )
        batches = [
            call.kwargs["batch_operations"]
            for call in container.execute_item_batch.call_args_list
        ]
        self.assertEqual([len(batch) for batch in batches], [100, 100, 6])
        self.assertTrue(batches[-1][-1][1][0].endswith("conversation-1"))
        self.assertTrue(all(call[0] == "delete" for batch in batches for call in batch))
        for call in container.execute_item_batch.call_args_list:
            self.assertEqual(call.kwargs["partition_key"], USER_SCOPE.owner_key)

    @patch("app.infrastructure.persistence.cosmos.get_container")
    def test_delete_resumes_from_deletion_marker(self, get_container: MagicMock) -> None:
        container = get_container.return_value
        container.read_item.return_value = {
            "id": "tenant-1:user-1:conversation-1",
            "conversation_id": "conversation-1",
            "document_type": "conversation",
            "tenant_id": USER_SCOPE.tenant_id,
            "owner_id": USER_SCOPE.user_id,
            "state": "deleting",
        }
        container.query_items.return_value = []

        self.assertTrue(delete_conversation(USER_SCOPE, "conversation-1"))

        container.patch_item.assert_not_called()
        operations = container.execute_item_batch.call_args.kwargs["batch_operations"]
        self.assertEqual(
            operations,
            [("delete", ("tenant-1:user-1:conversation-1",))],
        )

    def test_container_schema_version_is_v3(self) -> None:
        self.assertEqual(CONTAINER_SCHEMA_VERSION, "v3")

    @patch("app.infrastructure.persistence.cosmos.CosmosClient")
    def test_container_client_uses_versioned_name(self, cosmos_client: MagicMock) -> None:
        get_container.cache_clear()
        environment = patch.dict(
            os.environ,
            {
                "AZURE_COSMOS_ENDPOINT": "https://example.documents.azure.com:443/",
                "AZURE_COSMOS_DATABASE_NAME": "database",
                "AZURE_COSMOS_CONTAINER_NAME": "chat",
                "AZURE_COSMOS_KEY": "test-key",
                "AZURE_COSMOS_CREATE_CONTAINER": "false",
            },
        )
        with environment:
            container = get_container()

        database = cosmos_client.return_value.get_database_client.return_value
        database.get_container_client.assert_called_once_with("chat-v3")
        container.read.assert_called_once_with()
        get_container.cache_clear()


class ModelSettingsStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.environment = patch.dict(os.environ, {"PERSISTENCE_BACKEND": "cosmos"})
        self.environment.start()
        reset_repositories()

    def tearDown(self) -> None:
        reset_repositories()
        self.environment.stop()

    @patch("app.infrastructure.persistence.cosmos.get_container")
    def test_missing_settings_return_model_defaults(self, get_container: MagicMock) -> None:
        get_container.return_value.read_item.side_effect = CosmosResourceNotFoundError()
        settings = get_model_settings("Kimi-K2.5")
        self.assertEqual(settings.api_surface, "chat_completions")
        self.assertEqual(settings.modalities, ("text",))

    @patch("app.infrastructure.persistence.cosmos.get_container")
    def test_save_settings_uses_model_settings_partition(self, get_container: MagicMock) -> None:
        settings = save_model_settings(ModelSettings(model="gpt-test", modalities=("text", "voice")))
        document = get_container.return_value.upsert_item.call_args.args[0]
        self.assertEqual(document["partition_key"], "model-settings")
        self.assertEqual(document["document_type"], "model_settings")
        self.assertEqual(document["modalities"], ["text", "voice"])
        self.assertEqual(settings.model, "gpt-test")


if __name__ == "__main__":
    unittest.main()
