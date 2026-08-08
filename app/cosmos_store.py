from functools import lru_cache

from azure.cosmos import CosmosClient, PartitionKey
from azure.cosmos.exceptions import (
    CosmosBatchOperationError,
    CosmosResourceExistsError,
    CosmosResourceNotFoundError,
)

from app.azure_credential import get_azure_credential
from app.config import env_bool, env_text
from app.errors import InvalidRequestError
from app.persistence_models import (
    CONVERSATION_TYPE,
    MESSAGE_TYPE,
    MODEL_SETTINGS_PARTITION,
    MODEL_SETTINGS_TYPE,
    USE_CASE_SETTINGS_PARTITION,
    USE_CASE_SETTINGS_TYPE,
    Conversation,
    ConversationMessage,
    ModelSettings,
    UseCaseBinding,
    conversation_from_record,
    message_from_record,
    model_document_id,
    scoped_document_id,
    settings_document,
    settings_from_record,
    use_case_settings_document,
)
from app.repository_contracts import ConversationPageKey, UsageRecord
from app.security import UserScope

PARTITION_KEY_PATH = "/partition_key"
CONTAINER_SCHEMA_VERSION = "v3"
MAX_BATCH_OPERATIONS = 100
CONVERSATION_STATE_ACTIVE = "active"
CONVERSATION_STATE_DELETING = "deleting"
INDEXING_POLICY = {
    "automatic": True,
    "indexingMode": "consistent",
    "includedPaths": [{"path": "/*"}],
    "excludedPaths": [{"path": '/"_etag"/?'}],
    "compositeIndexes": [
        [
            {"path": "/updated_at", "order": "descending"},
            {"path": "/id", "order": "ascending"},
        ],
        [
            {"path": "/created_at", "order": "ascending"},
            {"path": "/id", "order": "ascending"},
        ],
    ],
}


@lru_cache(maxsize=1)
def get_container():
    endpoint = env_text("AZURE_COSMOS_ENDPOINT", "") or ""
    database_name = env_text("AZURE_COSMOS_DATABASE_NAME", "") or ""
    base_container_name = env_text("AZURE_COSMOS_CONTAINER_NAME", "foundry-chat-app") or ""
    container_name = f"{base_container_name}-{CONTAINER_SCHEMA_VERSION}"
    if not endpoint or not database_name or not container_name:
        raise RuntimeError(
            "Cosmos DB is not configured. Set AZURE_COSMOS_ENDPOINT, "
            "AZURE_COSMOS_DATABASE_NAME, and AZURE_COSMOS_CONTAINER_NAME."
        )

    key = env_text("AZURE_COSMOS_KEY", "") or ""
    credential = key or get_azure_credential()
    client = CosmosClient(endpoint, credential=credential)
    database = client.get_database_client(database_name)

    if _env_flag("AZURE_COSMOS_CREATE_CONTAINER"):
        return database.create_container_if_not_exists(
            id=container_name,
            partition_key=PartitionKey(path=PARTITION_KEY_PATH),
            indexing_policy=INDEXING_POLICY,
        )

    container = database.get_container_client(container_name)
    container.read()
    return container


def initialize_cosmos_store() -> None:
    get_container()


def check_cosmos_store() -> None:
    get_container().read()


def _env_flag(name: str) -> bool:
    return env_bool(name)


class CosmosConversationRepository:
    def list_conversations(
        self,
        scope: UserScope,
        use_case: str,
        limit: int,
        after: ConversationPageKey | None,
    ) -> list[Conversation]:
        parameters = [
            {"name": "@document_type", "value": CONVERSATION_TYPE},
            {"name": "@tenant_id", "value": scope.tenant_id},
            {"name": "@owner_id", "value": scope.user_id},
            {"name": "@use_case", "value": use_case},
            {"name": "@state", "value": CONVERSATION_STATE_ACTIVE},
            {"name": "@limit", "value": limit},
        ]
        if after is not None:
            parameters.extend(
                (
                    {"name": "@updated_at", "value": after.updated_at},
                    {"name": "@id", "value": scoped_document_id(scope, after.id)},
                )
            )
            query = (
                "SELECT TOP @limit c.id, c.conversation_id, c.title, c.use_case, "
                "c.created_at, c.updated_at FROM c "
                "WHERE c.document_type = @document_type AND c.tenant_id = @tenant_id "
                "AND c.owner_id = @owner_id AND c.use_case = @use_case AND c.state = @state "
                "AND (c.updated_at < @updated_at OR "
                "(c.updated_at = @updated_at AND c.id > @id)) "
                "ORDER BY c.updated_at DESC, c.id ASC"
            )
        else:
            query = (
                "SELECT TOP @limit c.id, c.conversation_id, c.title, c.use_case, "
                "c.created_at, c.updated_at FROM c "
                "WHERE c.document_type = @document_type AND c.tenant_id = @tenant_id "
                "AND c.owner_id = @owner_id AND c.use_case = @use_case AND c.state = @state "
                "ORDER BY c.updated_at DESC, c.id ASC"
            )
        rows = get_container().query_items(
            query=query,
            parameters=parameters,
            partition_key=scope.owner_key,
        )
        return [conversation_from_record(row) for row in rows]

    def create_conversation(self, scope: UserScope, conversation: Conversation) -> None:
        get_container().create_item(
            {
                "id": scoped_document_id(scope, conversation.id),
                "conversation_id": conversation.id,
                "partition_key": scope.owner_key,
                "document_type": CONVERSATION_TYPE,
                "tenant_id": scope.tenant_id,
                "owner_id": scope.user_id,
                "state": CONVERSATION_STATE_ACTIVE,
                "title": conversation.title,
                "use_case": conversation.use_case,
                "created_at": conversation.created_at,
                "updated_at": conversation.updated_at,
            }
        )

    def get_conversation(
        self,
        scope: UserScope,
        conversation_id: str,
    ) -> Conversation | None:
        try:
            document = get_container().read_item(
                item=scoped_document_id(scope, conversation_id),
                partition_key=scope.owner_key,
            )
        except CosmosResourceNotFoundError:
            return None
        if (
            document.get("document_type") != CONVERSATION_TYPE
            or document.get("tenant_id") != scope.tenant_id
            or document.get("owner_id") != scope.user_id
            or document.get("state") != CONVERSATION_STATE_ACTIVE
        ):
            return None
        return conversation_from_record(document)

    def list_messages(
        self,
        scope: UserScope,
        conversation_id: str,
    ) -> list[ConversationMessage]:
        rows = get_container().query_items(
            query=(
                "SELECT * FROM c WHERE c.document_type = @document_type "
                "AND c.tenant_id = @tenant_id AND c.owner_id = @owner_id "
                "AND c.conversation_id = @conversation_id "
                "ORDER BY c.created_at ASC, c.id ASC"
            ),
            parameters=[
                {"name": "@document_type", "value": MESSAGE_TYPE},
                {"name": "@tenant_id", "value": scope.tenant_id},
                {"name": "@owner_id", "value": scope.user_id},
                {"name": "@conversation_id", "value": conversation_id},
            ],
            partition_key=scope.owner_key,
        )
        return [message_from_record(row) for row in rows]

    def append_message(self, scope: UserScope, message: ConversationMessage) -> None:
        document = {
            "id": scoped_document_id(scope, message.id),
            "message_id": message.id,
            "partition_key": scope.owner_key,
            "document_type": MESSAGE_TYPE,
            "tenant_id": scope.tenant_id,
            "owner_id": scope.user_id,
            "conversation_id": message.conversation_id,
            "role": message.role,
            "content": message.content,
            "model": message.model,
            "api_surface": message.api_surface,
            "duration_ms": message.duration_ms,
            "error": message.error,
            "usage": message.usage,
            "guardrail_variant": message.guardrail_variant,
            "guardrail_policy_name": message.guardrail_policy_name,
            "guardrail_results": message.guardrail_results,
            "created_at": message.created_at,
        }
        try:
            get_container().execute_item_batch(
                batch_operations=[
                    ("create", (document,)),
                    (
                        "patch",
                        (
                            scoped_document_id(scope, message.conversation_id),
                            [
                                {
                                    "op": "replace",
                                    "path": "/updated_at",
                                    "value": message.created_at,
                                }
                            ],
                        ),
                        {
                            "filter_predicate": (
                                f'FROM c WHERE c.state = "{CONVERSATION_STATE_ACTIVE}"'
                            )
                        },
                    ),
                ],
                partition_key=scope.owner_key,
            )
        except CosmosBatchOperationError as exc:
            if exc.status_code == 412:
                raise InvalidRequestError("Conversation is being deleted.") from exc
            raise

    def delete_conversation(self, scope: UserScope, conversation_id: str) -> bool:
        container = get_container()
        conversation_document_id = scoped_document_id(scope, conversation_id)
        try:
            document = container.read_item(
                item=conversation_document_id,
                partition_key=scope.owner_key,
            )
        except CosmosResourceNotFoundError:
            return False
        if (
            document.get("document_type") != CONVERSATION_TYPE
            or document.get("tenant_id") != scope.tenant_id
            or document.get("owner_id") != scope.user_id
        ):
            return False
        state = document.get("state")
        if state == CONVERSATION_STATE_ACTIVE:
            container.patch_item(
                item=conversation_document_id,
                partition_key=scope.owner_key,
                patch_operations=[
                    {
                        "op": "replace",
                        "path": "/state",
                        "value": CONVERSATION_STATE_DELETING,
                    }
                ],
                filter_predicate=f'FROM c WHERE c.state = "{CONVERSATION_STATE_ACTIVE}"',
            )
        elif state != CONVERSATION_STATE_DELETING:
            return False

        message_ids = list(
            container.query_items(
                query=(
                    "SELECT VALUE c.id FROM c WHERE c.document_type = @document_type "
                    "AND c.tenant_id = @tenant_id AND c.owner_id = @owner_id "
                    "AND c.conversation_id = @conversation_id"
                ),
                parameters=[
                    {"name": "@document_type", "value": MESSAGE_TYPE},
                    {"name": "@tenant_id", "value": scope.tenant_id},
                    {"name": "@owner_id", "value": scope.user_id},
                    {"name": "@conversation_id", "value": conversation_id},
                ],
                partition_key=scope.owner_key,
            )
        )
        while len(message_ids) >= MAX_BATCH_OPERATIONS:
            chunk = message_ids[:MAX_BATCH_OPERATIONS]
            container.execute_item_batch(
                batch_operations=[("delete", (message_id,)) for message_id in chunk],
                partition_key=scope.owner_key,
            )
            del message_ids[:MAX_BATCH_OPERATIONS]

        final_ids = [*message_ids, conversation_document_id]
        container.execute_item_batch(
            batch_operations=[("delete", (item_id,)) for item_id in final_ids],
            partition_key=scope.owner_key,
        )
        return True

    def list_usage(
        self,
        scope: UserScope,
        start_at: str,
        model: str | None,
    ) -> list[UsageRecord]:
        parameters = [
            {"name": "@document_type", "value": MESSAGE_TYPE},
            {"name": "@role", "value": "assistant"},
            {"name": "@start", "value": start_at},
            {"name": "@tenant_id", "value": scope.tenant_id},
            {"name": "@owner_id", "value": scope.user_id},
        ]
        model_filter = ""
        if model:
            model_filter = " AND c.model = @model"
            parameters.append({"name": "@model", "value": model})
        rows = get_container().query_items(
            # `model_filter` is a fixed literal; the value is bound via the @model parameter.
            query=(
                "SELECT c.model, c.duration_ms, c.usage, c.created_at FROM c "  # noqa: S608
                "WHERE c.document_type = @document_type AND c.role = @role "
                "AND c.tenant_id = @tenant_id AND c.owner_id = @owner_id "
                "AND IS_DEFINED(c.model) AND NOT IS_NULL(c.model) AND c.created_at >= @start"
                f"{model_filter} ORDER BY c.created_at ASC, c.id ASC"
            ),
            parameters=parameters,
            partition_key=scope.owner_key,
        )
        return [
            UsageRecord(
                model=row["model"],
                duration_ms=row.get("duration_ms"),
                usage=row.get("usage"),
                created_at=row["created_at"],
            )
            for row in rows
        ]


class CosmosModelSettingsRepository:
    def list_models(self) -> list[str]:
        rows = get_container().query_items(
            query=(
                "SELECT c.model FROM c WHERE c.document_type = @document_type "
                "ORDER BY c.model"
            ),
            parameters=[{"name": "@document_type", "value": MODEL_SETTINGS_TYPE}],
            partition_key=MODEL_SETTINGS_PARTITION,
        )
        return [row["model"] for row in rows]

    def get_settings(self, model: str) -> ModelSettings | None:
        try:
            document = get_container().read_item(
                item=model_document_id(model),
                partition_key=MODEL_SETTINGS_PARTITION,
            )
        except CosmosResourceNotFoundError:
            return None
        return settings_from_record(document)

    def add_settings_if_absent(self, settings: ModelSettings) -> None:
        try:
            get_container().create_item(settings_document(settings))
        except CosmosResourceExistsError:
            pass

    def save_settings(self, settings: ModelSettings) -> None:
        get_container().upsert_item(settings_document(settings))


class CosmosUseCaseResourceSettingsRepository:
    def get_binding(self, use_case: str) -> UseCaseBinding | None:
        try:
            document = get_container().read_item(
                item=use_case,
                partition_key=USE_CASE_SETTINGS_PARTITION,
            )
        except CosmosResourceNotFoundError:
            return None
        if document.get("document_type") != USE_CASE_SETTINGS_TYPE:
            return None
        return UseCaseBinding(
            use_case=document["use_case"],
            binding=document["binding"],
        )

    def save_binding(self, binding: UseCaseBinding) -> None:
        get_container().upsert_item(use_case_settings_document(binding))
