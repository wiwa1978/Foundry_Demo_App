import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.errors import ExternalServiceError
from app.schemas import ChatRequest
from app.features.dependencies import current_user_scope
from app.security import UserScope
from app.services.chat import chat_service


router = APIRouter(tags=["Text Chat"])
logger = logging.getLogger(__name__)


@router.post("/api/chat")
async def chat(
    request: ChatRequest,
    scope: Annotated[UserScope, Depends(current_user_scope)],
) -> dict:
    try:
        return await chat_service.complete(request, scope)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("chat_request_failed")
        raise ExternalServiceError("Chat request") from exc


@router.post("/api/chat/stream")
def chat_stream(
    request: ChatRequest,
    scope: Annotated[UserScope, Depends(current_user_scope)],
) -> StreamingResponse:
    try:
        prepared = chat_service.prepare(request, scope)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return StreamingResponse(
        (_sse(event) for event in chat_service.stream(request, scope, prepared)),
        media_type="text/event-stream",
    )


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"
