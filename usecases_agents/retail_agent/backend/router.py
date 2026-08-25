import json
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.dependencies import current_user_scope
from app.domain.identity import UserScope

from .schemas import RetailAgentRequest
from .service import stream_retail_agent

router = APIRouter(tags=["Retail Agent"])


@router.post("/api/retail-agent/stream")
def retail_agent_stream(
    request: RetailAgentRequest,
    scope: Annotated[UserScope, Depends(current_user_scope)],
) -> StreamingResponse:
    del scope

    async def encoded_events():
        async for event in stream_retail_agent(
            request.message,
            session_id=request.session_id,
            cart=request.cart,
        ):
            yield f"data: {json.dumps(event, default=lambda value: value.model_dump())}\n\n"

    return StreamingResponse(
        encoded_events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
