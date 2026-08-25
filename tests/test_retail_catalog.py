from types import SimpleNamespace

from usecases_agents.retail_agent.agent import catalog


def test_search_products_uses_cosmos_vector_catalog(monkeypatch):
    monkeypatch.setenv(
        "FOUNDRY_RETAIL_CATALOG_COSMOS_ENDPOINT",
        "https://catalog.documents.azure.com:443/",
    )
    monkeypatch.setenv("FOUNDRY_RETAIL_CATALOG_COSMOS_DATABASE_NAME", "zava")
    monkeypatch.setenv("FOUNDRY_RETAIL_CATALOG_COSMOS_CONTAINER_NAME", "product_catalog")
    queries = []

    class FakeContainer:
        def query_items(self, **kwargs):
            queries.append(kwargs)
            return [
                {
                    "ProductID": "PROD0018",
                    "ProductName": "Deep Forest",
                    "ProductCategory": "Paint Shade",
                    "Price": 119.93,
                }
            ]

    monkeypatch.setattr(
        catalog,
        "create_embeddings",
        lambda **_kwargs: {"vectors": [[0.1, 0.2, 0.3]]},
    )
    monkeypatch.setattr(catalog, "_catalog_container", lambda *_args: FakeContainer())

    products = catalog.search_products("green paint")

    assert products == [
        {
            "id": "PROD0018",
            "name": "Deep Forest",
            "type": "Paint Shade",
            "description": None,
            "imageURL": None,
            "punchLine": None,
            "price": 119.93,
        }
    ]
    assert len(queries) == 1
    assert "VECTORDISTANCE" in queries[0]["query"]
    assert queries[0]["parameters"][0]["name"] == "@vector"


def test_empty_configured_cosmos_catalog_does_not_use_local_results(monkeypatch):
    monkeypatch.setenv(
        "FOUNDRY_RETAIL_CATALOG_COSMOS_ENDPOINT",
        "https://catalog.documents.azure.com:443/",
    )
    monkeypatch.setenv("FOUNDRY_RETAIL_CATALOG_COSMOS_DATABASE_NAME", "zava")
    monkeypatch.setenv("FOUNDRY_RETAIL_CATALOG_COSMOS_CONTAINER_NAME", "product_catalog")
    monkeypatch.setattr(catalog, "create_embeddings", lambda **_kwargs: {"vectors": [[0.1]]})
    monkeypatch.setattr(
        catalog,
        "_catalog_container",
        lambda *_args: SimpleNamespace(query_items=lambda **_kwargs: []),
    )

    assert catalog.search_products("green paint") == []
