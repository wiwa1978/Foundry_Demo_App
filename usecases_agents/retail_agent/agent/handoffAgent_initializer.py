import os
from pathlib import Path

from app.infrastructure.azure.credentials import get_azure_credential
from app.infrastructure.azure.foundry.settings import load_settings


def main():
    settings = load_settings()
    if not settings.endpoint:
        raise RuntimeError("Set FOUNDRY_PROJECT_ENDPOINT before initializing the handoff agent.")
    from azure.ai.projects import AIProjectClient
    from azure.ai.projects.models import (
        PromptAgentDefinition,
        PromptAgentDefinitionTextOptions,
        TextResponseFormatJsonSchema,
    )

    from .handoff_service import IntentClassification

    prompt = (Path(__file__).resolve().parents[1] / "prompts" / "HandoffAgentPrompt.txt").read_text(encoding="utf-8")
    client = AIProjectClient(endpoint=settings.endpoint, credential=get_azure_credential(), allow_preview=True)
    model = os.getenv("FOUNDRY_RETAIL_MODEL") or (settings.models[0] if settings.models else None)
    if not model:
        raise RuntimeError("Set FOUNDRY_RETAIL_MODEL or FOUNDRY_MODELS before initializing the handoff agent.")
    with client:
        return client.agents.create_version(
            agent_name="zava-handoff-service-agent",
            description="Zava Handoff Service",
            definition=PromptAgentDefinition(
                model=model,
                instructions=prompt,
                text=PromptAgentDefinitionTextOptions(
                    format=TextResponseFormatJsonSchema(
                        name="IntentClassification", schema=IntentClassification.model_json_schema()
                    )
                ),
            ),
        )


if __name__ == "__main__":
    main()
