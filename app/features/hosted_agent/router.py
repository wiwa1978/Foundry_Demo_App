import json
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.features.dependencies import current_user_scope
from app.features.hosted_agent.schemas import HostedAgentRequest
from app.features.hosted_agent.service import stream_hosted_agent
from app.security import UserScope

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
