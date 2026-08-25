import os
from pathlib import Path
from typing import Any

from app.infrastructure.azure.credentials import get_azure_credential
from app.infrastructure.azure.foundry.settings import load_settings

from .agent_initializer import initialize_agent
from .tool_definitions import get_tools_for_agent


def initialize_retail_agent(agent_type: str, name: str, prompt_file: str, description: str) -> Any:
    settings = load_settings()
    endpoint = settings.endpoint
    model = os.getenv("FOUNDRY_RETAIL_MODEL") or (settings.models[0] if settings.models else None)
    if not endpoint or not model:
        raise RuntimeError("Set FOUNDRY_PROJECT_ENDPOINT and FOUNDRY_RETAIL_MODEL (or FOUNDRY_MODELS).")
    prompt_path = Path(__file__).resolve().parents[1] / "prompts" / prompt_file
    instructions = prompt_path.read_text(encoding="utf-8")
    from azure.ai.projects import AIProjectClient

    client = AIProjectClient(endpoint=endpoint, credential=get_azure_credential(), allow_preview=True)
    return initialize_agent(
        client,
        model=model,
        name=name,
        description=description,
        instructions=instructions,
        tools=get_tools_for_agent(agent_type),
    )
