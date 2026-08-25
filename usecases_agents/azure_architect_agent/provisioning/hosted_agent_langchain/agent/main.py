import asyncio
import os

from azure.ai.agentserver.responses import (
    CreateResponse,
    ResponseContext,
    ResponsesAgentServerHost,
    ResponsesServerOptions,
    TextResponse,
)
from azure.identity import DefaultAzureCredential
from langchain_azure_ai.chat_models import AzureAIOpenAIApiChatModel
from langchain_azure_ai.tools import AzureAIProjectToolbox
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage


PROJECT_ENDPOINT = os.environ["FOUNDRY_PROJECT_ENDPOINT"]
MODEL_NAME = os.environ["AZURE_AI_MODEL_DEPLOYMENT_NAME"]
INSTRUCTIONS = (
    "You are an Azure architecture assistant. Explain Azure services in practical "
    "terms, prefer secure production-ready designs, state assumptions, distinguish "
    "facts from recommendations, and when comparing services cover purpose, "
    "strengths, limitations, and when to choose each option."
)

llm = AzureAIOpenAIApiChatModel(
    project_endpoint=PROJECT_ENDPOINT,
    credential=DefaultAzureCredential(),
    model=MODEL_NAME,
    streaming=True,
)
toolbox = AzureAIProjectToolbox(toolbox_name=os.environ["TOOLBOX_NAME"])
_llm_with_tools = None


def history_to_messages(history: list) -> list:
    messages = []
    for item in history:
        for content in item.get("content") or []:
            text = content.get("text")
            if not text:
                continue
            if content.get("type") == "output_text":
                messages.append(AIMessage(content=text))
            elif content.get("type") == "input_text":
                messages.append(HumanMessage(content=text))
    return messages


def response_text(content) -> str:
    if isinstance(content, list):
        return "".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in content
        )
    return str(content or "")


async def invoke_with_learn_tools(messages: list):
    global _llm_with_tools
    if _llm_with_tools is None:
        _llm_with_tools = llm.bind_tools(await toolbox.get_tools())

    current_messages = messages
    for _ in range(8):
        response = await _llm_with_tools.ainvoke(current_messages)
        if not isinstance(response, AIMessage) or not response.tool_calls:
            return response

        current_messages = [*current_messages, response]
        for tool_call in response.tool_calls:
            tool = next(
                tool
                for tool in await toolbox.get_tools()
                if tool.name == tool_call["name"]
            )
            result = await tool.ainvoke(tool_call["args"])
            current_messages.append(
                ToolMessage(content=response_text(result), tool_call_id=tool_call["id"])
            )

    raise RuntimeError("The model exceeded the Microsoft Learn tool-call limit.")


app = ResponsesAgentServerHost(
    options=ResponsesServerOptions(default_fetch_history_count=20)
)


@app.response_handler
async def handle_create(
    request: CreateResponse,
    context: ResponseContext,
    _cancellation_signal: asyncio.Event,
):
    history = await context.get_history()
    user_input = await context.get_input_text() or ""
    messages = [SystemMessage(content=INSTRUCTIONS), *history_to_messages(history)]
    messages.append(HumanMessage(content=user_input))
    response = await invoke_with_learn_tools(messages)
    return TextResponse(context, request, text=response_text(response.content))


if __name__ == "__main__":
    app.run()
