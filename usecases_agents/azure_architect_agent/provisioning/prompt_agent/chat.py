import os
import json
import io
import sys

from azure.identity import DefaultAzureCredential
from azure.ai.projects import AIProjectClient
from openai.types.responses.response_input_param import McpApprovalResponse
from dotenv import load_dotenv


# This client reads the same project and agent settings used by create_agent.py.
load_dotenv()
if isinstance(sys.stdout, io.TextIOWrapper):
    sys.stdout.reconfigure(encoding="utf-8")

# The SDK client obtains credentials through the developer's Azure identity.
project = AIProjectClient(
    endpoint=os.environ["PROJECT_ENDPOINT"],
    credential=DefaultAzureCredential(),
)

# The OpenAI-compatible client is used to send Responses API requests to the
# prompt agent that was created in Foundry.
openai = project.get_openai_client()
agent_reference = {
    "agent_reference": {
        "name": os.environ["AGENT_NAME"],
        "type": "agent_reference",
    }
}

# Conversations keep the interactive chat history on the service.
conversation = openai.conversations.create()

def ask_with_approval(user_input: str):
    """Send a turn and resolve any MCP approval requests returned by the agent."""
    response = openai.responses.create(
        conversation=conversation.id,
        input=user_input,
        extra_body=agent_reference,
    )

    while True:
        approvals = []
        for item in response.output:
            if item.type != "mcp_approval_request" or not item.id:
                continue

            print(f"\nMCP approval requested")
            print(f"Server: {item.server_label}")
            print(f"Tool: {getattr(item, 'name', '<unknown>')}")
            print(
                f"Arguments: {json.dumps(getattr(item, 'arguments', None), indent=2)}"
            )
            # The safe default is to deny a tool call unless the user opts in.
            approved = input("Approve this call? (y/N): ").strip().lower() == "y"
            approvals.append(
                McpApprovalResponse(
                    type="mcp_approval_response",
                    approve=approved,
                    approval_request_id=item.id,
                )
            )

        if not approvals:
            return response

        # Continue the same response after sending the approval decisions.
        response = openai.responses.create(
            input=approvals,
            previous_response_id=response.id,
            extra_body=agent_reference,
        )


print("Conversation started. Type 'exit' to stop.")
while True:
    user_input = input("\nYou: ").strip()
    if user_input.lower() in {"exit", "quit"}:
        break
    if not user_input:
        continue

    response = ask_with_approval(user_input)
    print(f"\nAgent: {response.output_text}")