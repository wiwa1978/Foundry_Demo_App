import os
from pathlib import Path

from agent_framework import Agent
from agent_framework.foundry import FoundryChatClient
from agent_framework_foundry_hosting import FoundryToolbox, ResponsesHostServer
from azure.ai.agentserver.core.tasks import set_resilient_tasks_enabled
from azure.identity import DefaultAzureCredential


INSTRUCTIONS = """
You are an Azure architecture assistant.

Your responsibilities:
- Explain Azure services in practical terms.
- Prefer secure, production-ready designs.
- State assumptions when information is missing.
- Distinguish confirmed facts from recommendations.
- Use concise answers unless the user asks for detail.

When comparing services, include:
1. Primary purpose
2. Strengths
3. Limitations
4. When to choose each option

When the user asks about current Microsoft documentation, use the Microsoft
Learn MCP tools and ground the answer in the returned documentation.
"""


def load_skill_instructions() -> str:
    """Read bundled Foundry Skill files (skills/<name>/SKILL.md next to this
    module) and return their instruction bodies, with YAML front matter
    stripped, ready to append to the agent's system instructions.

    Hosted agents have no toolbox/MCP resource discovery for skills, so this
    "direct injection" pattern is how they get the same
    azure-architecture-review workflow the prompt agent gets through a
    toolbox. Skills are optional here: a missing skills/ folder is not an
    error, so the agent still runs without one.
    """
    skills_dir = Path(__file__).parent / "skills"
    if not skills_dir.is_dir():
        return ""

    blocks = []
    for skill_file in sorted(skills_dir.glob("*/SKILL.md")):
        text = skill_file.read_text(encoding="utf-8")
        if text.startswith("---"):
            # Strip the YAML front matter between the first two '---' lines;
            # only the Markdown body becomes agent instructions.
            _, _, remainder = text.partition("---")
            _, _, text = remainder.partition("---")
        blocks.append(text.strip())
    return "\n\n".join(blocks)


SKILL_INSTRUCTIONS = load_skill_instructions()
if SKILL_INSTRUCTIONS:
    INSTRUCTIONS = f"{INSTRUCTIONS}\n\n{SKILL_INSTRUCTIONS}"


def main() -> None:
    """Start the hosted-agent Responses server managed by azd and Foundry."""
    # FOUNDRY_PROJECT_ENDPOINT is injected by Foundry in deployment and by
    # `azd ai agent run` during local development.
    client = FoundryChatClient(
        project_endpoint=os.environ["FOUNDRY_PROJECT_ENDPOINT"],
        model=os.environ["AZURE_AI_MODEL_DEPLOYMENT_NAME"],
        credential=DefaultAzureCredential(),
    )

    # A hosted process cannot ask a person for approval interactively. This
    # sample uses the read-only Microsoft Learn MCP server without prompting.
    learn_mcp = FoundryToolbox(
        DefaultAzureCredential(),
        name=os.environ["TOOLBOX_NAME"],
        load_prompts=False,
    )
    agent = Agent(
        client=client,
        instructions=INSTRUCTIONS,
        tools=[learn_mcp],
        default_options={"store": False},
    )

    # ResponsesHostServer supplies the port, readiness endpoint, and
    # Responses protocol adapter expected by the hosted-agent platform.
    set_resilient_tasks_enabled(True)
    ResponsesHostServer(agent).run()


if __name__ == "__main__":
    main()
