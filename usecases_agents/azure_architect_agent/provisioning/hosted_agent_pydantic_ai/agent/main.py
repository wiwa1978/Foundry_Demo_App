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
from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport
from openai import AsyncOpenAI
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPToolset
from pydantic_ai.models.openai import OpenAIResponsesModel
from pydantic_ai.providers.openai import OpenAIProvider


class ArchitectureReview(BaseModel):
    summary: str
    assumptions: list[str]
    recommendation: str
    tradeoffs: list[str]


def create_toolbox() -> MCPToolset:
    credential = DefaultAzureCredential()
    token = credential.get_token("https://ai.azure.com/.default").token
    endpoint = (
        f"{os.environ['FOUNDRY_PROJECT_ENDPOINT'].rstrip('/')}/toolboxes/"
        f"{os.environ['TOOLBOX_NAME']}/mcp?api-version=v1"
    )
    client = Client(
        StreamableHttpTransport(
            url=endpoint,
            headers={"Authorization": f"Bearer {token}"},
        )
    )
    return MCPToolset(client)


def create_agent() -> Agent:
    credential = DefaultAzureCredential()
    token = credential.get_token("https://ai.azure.com/.default").token
    client = AsyncOpenAI(
        api_key=token,
        base_url=f"{os.environ['FOUNDRY_PROJECT_ENDPOINT'].rstrip('/')}/openai/v1",
    )
    model = OpenAIResponsesModel(
        os.environ["AZURE_AI_MODEL_DEPLOYMENT_NAME"],
        provider=OpenAIProvider(openai_client=client),
    )
    return Agent(
        model,
        output_type=ArchitectureReview,
        toolsets=[create_toolbox()],
        instructions=(
            "You are an Azure architecture assistant. Explain Azure services in "
            "practical terms, prefer secure production-ready designs, state "
            "assumptions, distinguish facts from recommendations, and compare "
            "options by purpose, strengths, limitations, and when to choose each. "
            "Use Microsoft Learn tools for current Azure documentation."
        ),
    )


review_agent = create_agent()
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
    prior_turns = []
    for item in history:
        for content in item.get("content") or []:
            text = content.get("text")
            if text:
                prior_turns.append(text)
    prompt = "\n".join([*prior_turns, user_input])
    result = await review_agent.run(prompt)
    review = result.output
    text = (
        f"Summary: {review.summary}\n\n"
        f"Assumptions:\n- " + "\n- ".join(review.assumptions) +
        f"\n\nRecommendation:\n{review.recommendation}\n\n"
        f"Trade-offs:\n- " + "\n- ".join(review.tradeoffs)
    )
    return TextResponse(context, request, text=text)


if __name__ == "__main__":
    app.run()
