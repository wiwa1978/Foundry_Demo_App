"""Provision the repo2-compatible retail agents in Azure AI Foundry."""

import os
from pathlib import Path

from dotenv import load_dotenv

from app.infrastructure.azure.credentials import get_azure_credential
from app.infrastructure.azure.foundry.settings import load_settings

from .agent_initializer import initialize_agent
from .handoff_service import IntentClassification
from .tool_definitions import get_tools_for_agent

AGENTS = (
    ("zava-shop-assistant-agent", "ShopperAgentPrompt.txt", "Zava Shopping Assistant", "cora"),
    ("zava-inventory-agent", "InventoryAgentPrompt.txt", "Zava Inventory", "inventory_agent"),
    ("zava-customer-loyalty-agent", "CustomerLoyaltyAgentPrompt.txt", "Zava Customer Loyalty", "customer_loyalty"),
    ("zava-cart-manager-agent", "CartManagerPrompt.txt", "Zava Cart Manager", "cart_manager"),
    ("zava-interior-designer-agent", "InteriorDesignAgentPrompt.txt", "Zava Interior Design", "interior_designer"),
)


def main() -> None:
    load_dotenv()
    settings = load_settings()
    model = os.getenv("FOUNDRY_RETAIL_MODEL") or (settings.models[0] if settings.models else None)
    if not settings.endpoint or not model:
        raise RuntimeError(
            "Set FOUNDRY_PROJECT_ENDPOINT and FOUNDRY_RETAIL_MODEL "
            "(or FOUNDRY_MODELS) before provisioning."
        )

    from azure.ai.projects import AIProjectClient
    from azure.ai.projects.models import (
        PromptAgentDefinition,
        PromptAgentDefinitionTextOptions,
        TextResponseFormatJsonSchema,
    )

    prompt_dir = Path(__file__).resolve().parents[1] / "prompts"
    client = AIProjectClient(
        endpoint=settings.endpoint,
        credential=get_azure_credential(),
        allow_preview=True,
    )

    with client:
        for name, prompt_file, description, agent_type in AGENTS:
            agent = initialize_agent(
                client,
                model=model,
                name=name,
                description=description,
                instructions=(prompt_dir / prompt_file).read_text(encoding="utf-8"),
                tools=get_tools_for_agent(agent_type),
            )
            print(f"Created {name}, version {agent.version}")

        handoff = client.agents.create_version(
            agent_name="zava-handoff-service-agent",
            description="Zava Handoff Service",
            definition=PromptAgentDefinition(
                model=model,
                instructions=(prompt_dir / "HandoffAgentPrompt.txt").read_text(encoding="utf-8"),
                text=PromptAgentDefinitionTextOptions(
                    format=TextResponseFormatJsonSchema(
                        name="IntentClassification",
                        schema=IntentClassification.model_json_schema(),
                    )
                ),
            ),
        )
        print(f"Created zava-handoff-service-agent, version {handoff.version}")


if __name__ == "__main__":
    main()
