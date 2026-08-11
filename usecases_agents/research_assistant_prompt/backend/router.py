import json
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.api.dependencies import current_user_scope
from app.domain.identity import UserScope
from usecases_agents.research_assistant_prompt.backend.schemas import (
    AgentResearchRequest,
    AgentResearchTraceResponse,
)
from usecases_agents.research_assistant_prompt.backend.service import stream_agent_research
from usecases_agents.research_assistant_prompt.backend.tracing import (
    get_agent_research_trace,
)

router = APIRouter(tags=["Research Agent"])


@router.get("/api/agent-research/trace", response_model=AgentResearchTraceResponse)
def agent_research_trace(
    response_id: Annotated[str, Query(pattern=r"^resp_[A-Za-z0-9_-]{1,200}$")],
    scope: Annotated[UserScope, Depends(current_user_scope)],
) -> AgentResearchTraceResponse:
    del scope
    return get_agent_research_trace(response_id)


@router.post("/api/agent-research/stream")
def agent_research_stream(
    request: AgentResearchRequest,
    scope: Annotated[UserScope, Depends(current_user_scope)],
) -> StreamingResponse:
    del scope

    async def encoded_events():
        async for event in stream_agent_research(request.question):
            yield _sse(event)

    return StreamingResponse(encoded_events(), media_type="text/event-stream")


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"
