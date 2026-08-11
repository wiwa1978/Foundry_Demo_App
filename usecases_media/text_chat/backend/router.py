import json
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.dependencies import current_user_scope
from app.api.schemas import ChatRequest
from app.application.chat import chat_service
from app.domain.identity import UserScope
from usecases_media.text_chat.backend.schemas import ChatResponse

router = APIRouter(tags=["Text Chat"])


@router.post(
    "/api/chat",
    response_model=ChatResponse,
    response_model_exclude_unset=True,
)
async def chat(
    request: ChatRequest,
    scope: Annotated[UserScope, Depends(current_user_scope)],
) -> dict:
    return await chat_service.complete(request, scope)


@router.post("/api/chat/stream")
def chat_stream(
    request: ChatRequest,
    scope: Annotated[UserScope, Depends(current_user_scope)],
) -> StreamingResponse:
    prepared = chat_service.prepare(request, scope)
    return StreamingResponse(
        (_sse(event) for event in chat_service.stream(request, scope, prepared)),
        media_type="text/event-stream",
    )


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"
