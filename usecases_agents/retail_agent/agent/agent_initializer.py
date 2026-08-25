from collections.abc import Sequence
from typing import Any


def initialize_agent(
    project_client: Any,
    *,
    model: str,
    name: str,
    description: str,
    instructions: str,
    tools: Sequence[Any] = (),
) -> Any:
    """Create a version without requiring configuration during module import."""
    from azure.ai.projects.models import PromptAgentDefinition

    return project_client.agents.create_version(
        agent_name=name,
        description=description,
        definition=PromptAgentDefinition(
            model=model,
            instructions=instructions,
            tools=list(tools),
        ),
    )
