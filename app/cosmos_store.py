import os
from functools import lru_cache

from azure.cosmos import CosmosClient, PartitionKey
from app.azure_credential import get_azure_credential

PARTITION_KEY_PATH = "/partition_key"


@lru_cache(maxsize=1)
def get_container():
    endpoint = os.getenv("AZURE_COSMOS_ENDPOINT", "").strip()
    database_name = os.getenv("AZURE_COSMOS_DATABASE_NAME", "").strip()
    container_name = os.getenv("AZURE_COSMOS_CONTAINER_NAME", "foundry-chat-app").strip()
    if not endpoint or not database_name or not container_name:
        raise RuntimeError(
            "Cosmos DB is not configured. Set AZURE_COSMOS_ENDPOINT, "
            "AZURE_COSMOS_DATABASE_NAME, and AZURE_COSMOS_CONTAINER_NAME."
        )

    key = os.getenv("AZURE_COSMOS_KEY", "").strip()
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


def _env_flag(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes"}
