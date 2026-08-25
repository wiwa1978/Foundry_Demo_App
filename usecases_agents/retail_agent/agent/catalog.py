"""Retail product retrieval using the Repo 2 Cosmos vector catalog."""

import json
import logging
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from azure.cosmos import CosmosClient

from app.core.config import env_text, first_env
from app.infrastructure.azure.credentials import get_azure_credential
from app.infrastructure.azure.foundry.chat import create_embeddings

logger = logging.getLogger(__name__)

_PRODUCT_ID = re.compile(r"\bPROD\d{4}\b", re.IGNORECASE)
_PRODUCT_FIELDS = (
    "id",
    "name",
    "type",
    "description",
    "imageURL",
    "punchLine",
    "price",
)


def _local_catalog_path() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "product_catalog.json"


@lru_cache(maxsize=1)
def load_catalog() -> tuple[dict[str, Any], ...]:
    with _local_catalog_path().open(encoding="utf-8") as source:
        records = json.load(source)
    return tuple(
        {
            "id": item.get("ProductID"),
            "name": item.get("ProductName"),
            "type": item.get("ProductCategory"),
            "description": item.get("ProductDescription"),
            "imageURL": item.get("ImageURL"),
            "punchLine": item.get("ProductPunchLine"),
            "price": item.get("Price"),
        }
        for item in records
        if item.get("ProductID") and item.get("ProductName")
    )


def search_local(message: str, limit: int = 6) -> list[dict[str, Any]]:
    terms = {term.lower() for term in re.findall(r"[a-z0-9]+", message) if len(term) > 2}
    if not terms:
        return list(load_catalog()[:limit])
    ranked: list[tuple[int, dict[str, Any]]] = []
    for product in load_catalog():
        haystack = " ".join(str(product.get(key) or "") for key in _PRODUCT_FIELDS).lower()
        score = sum(term in haystack for term in terms)
        if score:
            ranked.append((score, product))
    ranked.sort(key=lambda item: (-item[0], str(item[1]["name"])))
    return [product for _, product in ranked[:limit]]


def _catalog_cosmos_settings() -> tuple[str, str, str] | None:
    endpoint = first_env("FOUNDRY_RETAIL_CATALOG_COSMOS_ENDPOINT", "COSMOS_ENDPOINT")
    database = first_env("FOUNDRY_RETAIL_CATALOG_COSMOS_DATABASE_NAME", "DATABASE_NAME")
    container = first_env("FOUNDRY_RETAIL_CATALOG_COSMOS_CONTAINER_NAME", "CONTAINER_NAME")
    if endpoint and database and container:
        return endpoint, database, container
    return None


@lru_cache(maxsize=4)
def _catalog_container(endpoint: str, database: str, container: str):
    client = CosmosClient(endpoint, credential=get_azure_credential())
    return client.get_database_client(database).get_container_client(container)


def _normalize_record(item: dict[str, Any]) -> dict[str, Any] | None:
    product_id = item.get("ProductID") or item.get("id")
    name = item.get("ProductName") or item.get("name")
    if not product_id or not name:
        return None
    return {
        "id": product_id,
        "name": name,
        "type": item.get("ProductCategory") or item.get("type"),
        "description": item.get("ProductDescription") or item.get("description"),
        "imageURL": item.get("ImageURL") or item.get("imageURL"),
        "punchLine": item.get("ProductPunchLine") or item.get("punchLine"),
        "price": item.get("Price") if item.get("Price") is not None else item.get("price"),
    }


def search_cosmos(message: str, limit: int = 6) -> list[dict[str, Any]]:
    settings = _catalog_cosmos_settings()
    if settings is None:
        raise RuntimeError("Retail catalog Cosmos DB is not configured")
    endpoint, database, container_name = settings
    embedding_model = env_text("FOUNDRY_RETAIL_CATALOG_EMBEDDING_MODEL")
    embedding_result = create_embeddings(inputs=[message], model=embedding_model)
    vectors = embedding_result["vectors"]
    if not vectors:
        raise RuntimeError("No embedding was returned for the retail catalog query")
    query = (
        "SELECT c.id, c.ProductID, c.ProductName, c.ProductCategory, "
        "c.ProductDescription, c.ImageURL, c.ProductPunchLine, c.Price "
        "FROM c ORDER BY VECTORDISTANCE(c.request_vector, @vector) "
        "OFFSET 0 LIMIT @top"
    )
    items = _catalog_container(endpoint, database, container_name).query_items(
        query=query,
        parameters=[
            {"name": "@vector", "value": vectors[0]},
            {"name": "@top", "value": limit},
        ],
        enable_cross_partition_query=True,
        max_item_count=limit,
    )
    return [record for item in items if (record := _normalize_record(dict(item))) is not None]


def search_products(message: str, limit: int = 6) -> list[dict[str, Any]]:
    """Use Cosmos vector retrieval when configured, otherwise use local demo data."""
    if _catalog_cosmos_settings() is None:
        return search_local(message, limit)
    return search_cosmos(message, limit)


def catalog_cosmos_configured() -> bool:
    return _catalog_cosmos_settings() is not None
