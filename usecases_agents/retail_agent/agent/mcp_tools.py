"""Local wrappers for the repo2 retail tools.

These wrappers keep phase one deterministic and make the same tool contract
available to a future Foundry-hosted multi-agent deployment.
"""

from typing import Any

from ..backend.service import _stock
from .catalog import search_products


async def mcp_product_recommendations(question: str) -> list[dict[str, Any]]:
    return search_products(question)


async def mcp_inventory_check(product_list: list[str]) -> list[dict[str, Any]]:
    return [
        {"product_id": product_id, "quantity_in_stock": _stock(product_id)}
        for product_id in product_list
    ]


async def mcp_calculate_discount(customer_id: str) -> dict[str, Any]:
    percentage = 25.0 if customer_id.upper() == "CUST001" else 7.5
    return {"customer_id": customer_id, "discount_percentage": percentage}


async def mcp_create_image(prompt: str, size: str = "1024x1024") -> dict[str, str]:
    return {"prompt": prompt, "size": size, "status": "image generation is not enabled in phase one"}


MCP_FUNCTIONS = {
    "mcp_create_image": mcp_create_image,
    "mcp_product_recommendations": mcp_product_recommendations,
    "mcp_calculate_discount": mcp_calculate_discount,
    "mcp_inventory_check": mcp_inventory_check,
}
