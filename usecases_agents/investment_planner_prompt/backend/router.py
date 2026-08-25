import json
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.dependencies import current_user_scope
from app.domain.identity import UserScope
from usecases_agents.investment_planner_prompt.backend.schemas import (
    InvestmentPlannerRequest,
)
from usecases_agents.investment_planner_prompt.backend.service import (
    stream_investment_plan,
)

router = APIRouter(tags=["Investment Planner Agent"])


@router.post("/api/investment-planner/stream")
def investment_planner_stream(
    request: InvestmentPlannerRequest,
    scope: Annotated[UserScope, Depends(current_user_scope)],
) -> StreamingResponse:
    del scope

    async def encoded_events():
        async for event in stream_investment_plan(request.question):
            yield _sse(event)

    return StreamingResponse(encoded_events(), media_type="text/event-stream")


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"
