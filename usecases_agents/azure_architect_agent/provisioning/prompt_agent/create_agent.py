import os

from azure.identity import DefaultAzureCredential
from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import MCPTool, PromptAgentDefinition
from dotenv import load_dotenv


# Keep configuration outside the source so the same script works across
# projects and model deployments.
load_dotenv()

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

When the user describes a workload and wants an Azure architecture
recommendation, comparison, or design review, apply the architecture-review
workflow directly and ground factual claims in Microsoft Learn tool results.
"""

# The project client manages the server-side agent version in Foundry.
project = AIProjectClient(
    endpoint=os.environ["PROJECT_ENDPOINT"],
    credential=DefaultAzureCredential(),
)

# Prompt Agents cannot reliably chain through a Foundry Toolbox MCP endpoint:
# the agent-side MCP proxy does not forward the Toolbox's downstream project
# connection. Attach the same anonymous project connection directly instead.
mcp_server_url = "https://learn.microsoft.com/api/mcp"
mcp_connection_name = os.environ.get("MCP_CONNECTION_NAME", "ms-learn-public")

# A prompt agent stores its instructions and tool declarations in Foundry;
# there is no application server to package or host for this variant.
agent = project.agents.create_version(
    agent_name=os.environ["AGENT_NAME"],
    definition=PromptAgentDefinition(
        model=os.environ["MODEL_NAME"],
        instructions=INSTRUCTIONS,
        tools=[
            # Approval is deliberately required because MCP calls act on
            # behalf of the agent.
            MCPTool(
                server_label="ms-learn",
                server_url=mcp_server_url,
                require_approval="always",
                project_connection_id=mcp_connection_name,
            )
        ],
    )
)

print(f"Agent created")
print(f"Name: {agent.name}")
print(f"Version: {agent.version}")
print(f"ID: {agent.id}")
