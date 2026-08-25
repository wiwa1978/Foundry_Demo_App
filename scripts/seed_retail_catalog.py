"""Upload the bundled retail catalog and embeddings to Cosmos DB."""

import json
from pathlib import Path
from typing import Any

from azure.cosmos import CosmosClient, PartitionKey

from app.core.config import env_text, first_env
from app.infrastructure.azure.credentials import get_azure_credential
from app.infrastructure.azure.foundry.chat import create_embeddings

CATALOG_PATH = Path(__file__).resolve().parents[1] / "usecases_agents" / "retail_agent" / "data" / "product_catalog.json"


def _catalog_settings() -> tuple[str, str, str]:
    endpoint = first_env("FOUNDRY_RETAIL_CATALOG_COSMOS_ENDPOINT", "COSMOS_ENDPOINT")
    database = first_env("FOUNDRY_RETAIL_CATALOG_COSMOS_DATABASE_NAME", "DATABASE_NAME")
    container = first_env("FOUNDRY_RETAIL_CATALOG_COSMOS_CONTAINER_NAME", "CONTAINER_NAME")
    if not endpoint or not database or not container:
        raise RuntimeError(
            "Set FOUNDRY_RETAIL_CATALOG_COSMOS_ENDPOINT, "
            "FOUNDRY_RETAIL_CATALOG_COSMOS_DATABASE_NAME, and "
            "FOUNDRY_RETAIL_CATALOG_COSMOS_CONTAINER_NAME."
        )
    return endpoint, database, container


def _load_items() -> list[dict[str, Any]]:
    records = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    if not isinstance(records, list):
        raise RuntimeError(f"Expected a JSON array in {CATALOG_PATH}")
    return [dict(record) for record in records]


def main() -> None:
    endpoint, database_name, container_name = _catalog_settings()
    items = _load_items()
    embedding_model = env_text("FOUNDRY_RETAIL_CATALOG_EMBEDDING_MODEL")
    texts = [
        " \n ".join(
            str(record.get(field) or "")
            for field in ("ProductName", "ProductCategory", "ProductDescription")
        )
        for record in items
    ]
    vectors = create_embeddings(inputs=texts, model=embedding_model)["vectors"]

    client = CosmosClient(endpoint, credential=get_azure_credential())
    database = client.create_database_if_not_exists(id=database_name)
    container = database.create_container_if_not_exists(
        id=container_name,
        partition_key=PartitionKey(path="/ProductID"),
    )
    for item, vector in zip(items, vectors, strict=True):
        item["id"] = str(item.get("ProductID") or item.get("id"))
        item["ProductID"] = str(item["ProductID"])
        item["request_vector"] = vector
        container.upsert_item(body=item)
        print(f"Uploaded {item['ProductID']}")
    print(f"Uploaded {len(items)} retail products to {database_name}/{container_name}.")


if __name__ == "__main__":
    main()
