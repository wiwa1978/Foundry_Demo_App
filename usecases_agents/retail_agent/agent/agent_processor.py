"""Conversation orchestration primitives for an optional hosted retail agent."""

import inspect
import json
from collections.abc import AsyncIterator
from typing import Any

from .mcp_tools import MCP_FUNCTIONS


class AgentProcessor:
    def __init__(self, project_client: Any, assistant_id: str, agent_type: str, thread_id: str | None = None):
        self.project_client = project_client
        self.agent_id = assistant_id
        self.agent_type = agent_type
        self.thread_id = thread_id

    async def run_conversation_with_text_stream(self, input_message: str = "") -> AsyncIterator[str]:
        client = self.project_client.get_openai_client()
        if self.thread_id:
            conversation_id = self.thread_id
            client.conversations.items.create(
                conversation_id=conversation_id,
                items=[{"type": "message", "role": "user", "content": input_message}],
            )
        else:
            conversation = client.conversations.create(
                items=[{"type": "message", "role": "user", "content": input_message}]
            )
            conversation_id = self.thread_id = conversation.id
        response = client.responses.create(
            conversation=conversation_id,
            extra_body={"agent_reference": {"name": self.agent_id, "type": "agent_reference"}},
            input="",
        )
        if not response.output_text:
            outputs = []
            for item in response.output:
                if item.type != "function_call":
                    continue
                handler = MCP_FUNCTIONS.get(item.name)
                result = await handler(**json.loads(item.arguments)) if handler else {"error": "Unknown tool"}
                outputs.append({"type": "function_call_output", "call_id": item.call_id, "output": json.dumps(result)})
            response = client.responses.create(
                previous_response_id=response.id,
                input=outputs,
                extra_body={"agent_reference": {"name": self.agent_id, "type": "agent_reference"}},
            )
        text = response.output_text
        if inspect.isawaitable(text):
            text = await text
        yield str(text)
