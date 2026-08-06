from functools import lru_cache
from azure.cosmos import CosmosClient, PartitionKey
from azure.cosmos.exceptions import CosmosResourceExistsError, CosmosResourceNotFoundError
from app.azure_credential import get_azure_credential
from app.config import env_bool, env_text
from app.persistence_models import (
    CONVERSATION_TYPE,
    MESSAGE_TYPE,
    MODEL_SETTINGS_PARTITION,
    MODEL_SETTINGS_TYPE,
    Conversation,
    ConversationMessage,
    ModelSettings,
    conversation_from_record,
    message_from_record,
    model_document_id,
    scoped_document_id,
    settings_document,
    settings_from_record,
)
from app.repository_contracts import UsageRecord
from app.security import UserScope

PARTITION_KEY_PATH = "/partition_key"
CONTAINER_SCHEMA_VERSION = "v2"


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
        offset: int,
    ) -> list[Conversation]:
        rows = get_container().query_items(
            query=(
                "SELECT c.id, c.conversation_id, c.title, c.use_case, c.created_at, "
                "c.updated_at FROM c WHERE c.document_type = @document_type AND "
                "c.tenant_id = @tenant_id AND c.owner_id = @owner_id AND "
                "((IS_DEFINED(c.use_case) AND c.use_case = @use_case) OR "
                "(@use_case = 'text_chat' AND NOT IS_DEFINED(c.use_case))) "
                "ORDER BY c.updated_at DESC, c.id ASC OFFSET @offset LIMIT @limit"
            ),
            parameters=[
                {"name": "@document_type", "value": CONVERSATION_TYPE},
                {"name": "@tenant_id", "value": scope.tenant_id},
                {"name": "@owner_id", "value": scope.user_id},
                {"name": "@use_case", "value": use_case},
                {"name": "@offset", "value": offset},
                {"name": "@limit", "value": limit},
            ],
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
                "AND c.conversation_id = @conversation_id "
                "ORDER BY c.created_at ASC, c.id ASC"
            ),
            parameters=[
                {"name": "@document_type", "value": MESSAGE_TYPE},
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
        get_container().execute_item_batch(
            batch_operations=[
                ("create", (document,)),
                (
                    "patch",
                    (
                        scoped_document_id(scope, message.conversation_id),
                        [{"op": "replace", "path": "/updated_at", "value": message.created_at}],
                    ),
                ),
            ],
            partition_key=scope.owner_key,
        )

    def delete_conversation(self, scope: UserScope, conversation_id: str) -> bool:
        if self.get_conversation(scope, conversation_id) is None:
            return False
        container = get_container()
        for message in self.list_messages(scope, conversation_id):
            container.delete_item(
                item=scoped_document_id(scope, message.id),
                partition_key=scope.owner_key,
            )
        container.delete_item(
            item=scoped_document_id(scope, conversation_id),
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
            query=(
                "SELECT c.model, c.duration_ms, c.usage, c.created_at FROM c "
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
