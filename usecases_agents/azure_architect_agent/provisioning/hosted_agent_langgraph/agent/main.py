import asyncio
import os
from typing import Annotated

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
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


INSTRUCTIONS = (
    "You are an Azure architecture assistant. Explain Azure services in practical "
    "terms, prefer secure production-ready designs, state assumptions, distinguish "
    "facts from recommendations, and when comparing services cover purpose, "
    "strengths, limitations, and when to choose each option."
)


class State(TypedDict):
    messages: Annotated[list, add_messages]


def history_to_messages(history: list) -> list:
    messages = []
    for item in history:
        for content in item.get("content") or []:
            text = content.get("text")
            if content.get("type") == "output_text" and text:
                messages.append(AIMessage(content=text))
            elif content.get("type") == "input_text" and text:
                messages.append(HumanMessage(content=text))
    return messages


def response_text(content) -> str:
    if isinstance(content, list):
        return "".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in content
        )
    return str(content or "")


model = AzureAIOpenAIApiChatModel(
    project_endpoint=os.environ["FOUNDRY_PROJECT_ENDPOINT"],
    credential=DefaultAzureCredential(),
    model=os.environ["AZURE_AI_MODEL_DEPLOYMENT_NAME"],
    streaming=True,
)
toolbox = AzureAIProjectToolbox(toolbox_name=os.environ["TOOLBOX_NAME"])
_model_with_tools = None


async def triage(state: State) -> dict:
    global _model_with_tools
    if _model_with_tools is None:
        _model_with_tools = model.bind_tools(await toolbox.get_tools())

    messages = [SystemMessage(content=INSTRUCTIONS), *state["messages"]]
    for _ in range(8):
        response = await _model_with_tools.ainvoke(messages)
        if not isinstance(response, AIMessage) or not response.tool_calls:
            return {"messages": [response]}
        messages.append(response)
        tools = await toolbox.get_tools()
        for tool_call in response.tool_calls:
            tool = next(tool for tool in tools if tool.name == tool_call["name"])
            result = await tool.ainvoke(tool_call["args"])
            messages.append(
                ToolMessage(content=response_text(result), tool_call_id=tool_call["id"])
            )
    raise RuntimeError("The model exceeded the Microsoft Learn tool-call limit.")


graph = StateGraph(State)
graph.add_node("triage", triage)
graph.add_edge(START, "triage")
graph.add_edge("triage", END)
TRIAGE_GRAPH = graph.compile()

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
    result = await TRIAGE_GRAPH.ainvoke(
        {"messages": [*history_to_messages(history), HumanMessage(content=user_input)]}
    )
    return TextResponse(context, request, text=response_text(result["messages"][-1].content))


if __name__ == "__main__":
    app.run()
