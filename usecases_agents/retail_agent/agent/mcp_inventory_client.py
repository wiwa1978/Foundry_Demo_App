"""Compatibility client for the repo2 MCP tool contract.

The phase-one API uses the local wrappers directly; this client remains
available for initializer scripts and future stdio deployment.
"""

from typing import Any

from .mcp_tools import MCP_FUNCTIONS


class MCPShopperToolsClient:
    async def connect(self) -> None:
        return None

    async def close(self) -> None:
        return None

    async def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> Any:
        handler = MCP_FUNCTIONS.get(tool_name)
        if handler is None:
            raise ValueError(f"Unknown retail tool: {tool_name}")
        return await handler(**arguments)

    async def list_tools(self) -> list[dict[str, Any]]:
        from .tool_definitions import TOOL_SCHEMAS

        return list(TOOL_SCHEMAS.values())


_client = MCPShopperToolsClient()


async def get_mcp_client() -> MCPShopperToolsClient:
    return _client
