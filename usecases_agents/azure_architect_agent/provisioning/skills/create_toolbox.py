# Creates or updates a Foundry toolbox that exposes the Microsoft Learn MCP
# server and prints the
# toolbox consumer endpoint.
#
# This is how the *prompt agent* variant gets access to the skill: a prompt
# agent has no application code to load a local SKILL.md at startup, so
# instead it points its single MCPTool at this toolbox's MCP endpoint.
#
# Reference: "Create and manage a toolbox in Microsoft Foundry"
# https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/toolbox
import os

from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import MCPToolboxTool
from azure.identity import DefaultAzureCredential
from dotenv import load_dotenv

load_dotenv()

TOOLBOX_NAME = os.environ.get("TOOLBOX_NAME", "azure-architect-toolbox")
MCP_CONNECTION_NAME = os.environ.get("MCP_CONNECTION_NAME", "ms-learn-public")


def main() -> None:
    """Create a new toolbox version with the Microsoft Learn MCP tool."""
    project_endpoint = os.environ["PROJECT_ENDPOINT"]
    project = AIProjectClient(
        endpoint=project_endpoint,
        credential=DefaultAzureCredential(),
    )

    print(f"Creating toolbox '{TOOLBOX_NAME}'...")
    toolbox_version = project.toolboxes.create_version(
        name=TOOLBOX_NAME,
        description="Microsoft Learn MCP tool for Azure architecture guidance.",
        tools=[
            # The toolbox proxies the same public ms-learn MCP server the
            # hosted agents call directly; centralizing it here means the
            # prompt agent only needs to know about this one endpoint.
            MCPToolboxTool(
                server_label="ms-learn",
                server_url="https://learn.microsoft.com/api/mcp",
                require_approval="never",
                project_connection_id=MCP_CONNECTION_NAME,
            ),
        ],
    )
    print(f"Created toolbox version: {toolbox_version.version}")
    print(
        f"Publish it as the default with: "
        f"azd ai toolbox publish {TOOLBOX_NAME} {toolbox_version.version}"
    )

    # Always connect agents to the *consumer* endpoint (no /versions/{n}
    # segment): it follows the default_version automatically.
    consumer_endpoint = f"{project_endpoint}/toolboxes/{TOOLBOX_NAME}/mcp?api-version=v1"
    print(f"\nToolbox consumer endpoint (use this as the prompt agent's MCP server_url):")
    print(consumer_endpoint)


if __name__ == "__main__":
    main()
