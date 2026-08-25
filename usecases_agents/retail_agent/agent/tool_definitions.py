from typing import Any

from azure.ai.projects.models import FunctionTool

TOOL_SCHEMAS: dict[str, dict[str, Any]] = {
    "mcp_product_recommendations": {
        "type": "function",
        "name": "mcp_product_recommendations",
        "description": "Search the Zava demo catalog for products.",
        "parameters": {
            "type": "object",
            "properties": {"question": {"type": "string"}},
            "required": ["question"],
            "additionalProperties": False,
        },
    },
    "mcp_inventory_check": {
        "type": "function",
        "name": "mcp_inventory_check",
        "description": "Check stock for product IDs.",
        "parameters": {
            "type": "object",
            "properties": {"product_list": {"type": "array", "items": {"type": "string"}}},
            "required": ["product_list"],
            "additionalProperties": False,
        },
    },
    "mcp_calculate_discount": {
        "type": "function",
        "name": "mcp_calculate_discount",
        "description": "Calculate a demo loyalty discount.",
        "parameters": {
            "type": "object",
            "properties": {"customer_id": {"type": "string"}},
            "required": ["customer_id"],
            "additionalProperties": False,
        },
    },
}

AGENT_TOOL_ASSIGNMENTS = {
    "interior_designer": ["mcp_product_recommendations"],
    "customer_loyalty": ["mcp_calculate_discount"],
    "inventory_agent": ["mcp_inventory_check"],
    "cart_manager": [],
    "cora": ["mcp_product_recommendations"],
}


def get_tools_for_agent(agent_type: str) -> list[FunctionTool]:
    """Build strict Foundry tools from the repo2-compatible local schemas."""
    tools: list[FunctionTool] = []
    for name in AGENT_TOOL_ASSIGNMENTS.get(agent_type, []):
        schema = TOOL_SCHEMAS[name]
        tools.append(
            FunctionTool(
                name=name,
                description=str(schema["description"]),
                parameters=dict(schema["parameters"]),
                strict=True,
            )
        )
    return tools
