"""Logical retail-agent identities and configurable Foundry names."""

import os
from typing import Literal

RetailAgentType = Literal[
    "cora",
    "interior_designer",
    "inventory_agent",
    "customer_loyalty",
    "cart_manager",
    "handoff",
]

RETAIL_AGENT_TYPES = frozenset(
    {
        "cora",
        "interior_designer",
        "inventory_agent",
        "customer_loyalty",
        "cart_manager",
        "handoff",
    }
)

_DEFAULT_AGENT_NAMES: dict[str, str] = {
    "cora": "zava-shop-assistant-agent",
    "interior_designer": "zava-interior-designer-agent",
    "inventory_agent": "zava-inventory-agent",
    "customer_loyalty": "zava-customer-loyalty-agent",
    "cart_manager": "zava-cart-manager-agent",
    "handoff": "zava-handoff-service-agent",
}

_ENVIRONMENT_NAMES: dict[str, str] = {
    "cora": "FOUNDRY_RETAIL_AGENT_NAME",
    "interior_designer": "FOUNDRY_RETAIL_INTERIOR_AGENT_NAME",
    "inventory_agent": "FOUNDRY_RETAIL_INVENTORY_AGENT_NAME",
    "customer_loyalty": "FOUNDRY_RETAIL_LOYALTY_AGENT_NAME",
    "cart_manager": "FOUNDRY_RETAIL_CART_AGENT_NAME",
    "handoff": "FOUNDRY_RETAIL_HANDOFF_AGENT_NAME",
}


def is_retail_agent_type(value: str) -> bool:
    return value in RETAIL_AGENT_TYPES


def resolve_retail_agent_name(agent_type: str) -> str:
    """Resolve one logical agent to its configured or Zava default name."""
    if not is_retail_agent_type(agent_type):
        raise ValueError(f"Unsupported retail agent type: {agent_type}")
    configured = os.getenv(_ENVIRONMENT_NAMES[agent_type], "").strip()
    return configured or _DEFAULT_AGENT_NAMES[agent_type]
