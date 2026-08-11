import json
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.dependencies import current_user_scope
from app.domain.identity import UserScope
from usecases_agents.research_assistant_hosted.backend.schemas import HostedAgentRequest
from usecases_agents.research_assistant_hosted.backend.service import stream_hosted_agent

router = APIRouter(tags=["Hosted Agent"])


@router.post("/api/hosted-agent/stream")
def hosted_agent_stream(
    request: HostedAgentRequest,
    scope: Annotated[UserScope, Depends(current_user_scope)],
) -> StreamingResponse:
    del scope

    async def encoded_events():
        async for event in stream_hosted_agent(request.message):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(encoded_events(), media_type="text/event-stream")
