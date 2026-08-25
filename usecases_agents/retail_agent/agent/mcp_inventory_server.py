"""Optional MCP stdio server exposing the bundled retail demo tools."""

import json

from .mcp_tools import (
    mcp_calculate_discount,
    mcp_create_image,
    mcp_inventory_check,
    mcp_product_recommendations,
)

try:
    from mcp.server.fastmcp import FastMCP
except ImportError:  # pragma: no cover - only needed when launched as an MCP server
    FastMCP = None


def create_server():
    if FastMCP is None:
        raise RuntimeError("Install the existing 'mcp' dependency to run the retail MCP server.")
    server = FastMCP("Retail Shopping Assistant")

    @server.tool()
    async def get_product_recommendations(question: str) -> str:
        return json.dumps(await mcp_product_recommendations(question))

    @server.tool()
    async def check_product_inventory(product_id: str) -> str:
        return json.dumps(await mcp_inventory_check([product_id]))

    @server.tool()
    async def get_customer_discount(customer_id: str) -> str:
        return json.dumps(await mcp_calculate_discount(customer_id))

    @server.tool()
    async def generate_product_image(prompt: str, size: str = "1024x1024") -> str:
        return json.dumps(await mcp_create_image(prompt, size))

    return server


if __name__ == "__main__":
    create_server().run(transport="stdio")
