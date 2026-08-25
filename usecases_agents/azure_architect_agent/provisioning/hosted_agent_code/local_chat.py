import asyncio
import os

from agent_framework import Agent, MCPStreamableHTTPTool
from agent_framework.foundry import FoundryChatClient
from azure.identity import AzureCliCredential
from dotenv import load_dotenv


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
"""


async def main() -> None:
    """Run the agent locally for development without deploying it."""
    learn_mcp = MCPStreamableHTTPTool(
        name="ms-learn",
        url="https://learn.microsoft.com/api/mcp",
        load_prompts=False,
    )

    # This local client uses Agent Framework directly; the deployed version
    # uses ResponsesHostServer in agent/main.py instead.
    agent = Agent(
        client=FoundryChatClient(
            project_endpoint=os.environ["PROJECT_ENDPOINT"],
            model=os.environ["MODEL_NAME"],
            credential=AzureCliCredential(),
        ),
        instructions=INSTRUCTIONS,
        tools=[learn_mcp],
    )
    # A session preserves the conversation history across local turns.
    session = agent.create_session()

    print("Hosted-agent-style conversation started. Type 'exit' to stop.")
    while True:
        user_input = input("\nYou: ").strip()
        if user_input.lower() in {"exit", "quit"}:
            break
        if not user_input:
            continue

        result = await agent.run(user_input, session=session)
        print(f"\nAgent: {result.text}")


if __name__ == "__main__":
    asyncio.run(main())
