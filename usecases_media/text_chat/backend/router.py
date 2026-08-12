import json
from typing import Annotated, cast

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.dependencies import chat_service as get_chat_service
from app.api.dependencies import current_user_scope
from app.api.schemas import ChatRequest
from app.application.chat import ChatService
from app.application.contracts.chat import ChatCommand, ReasoningEffort
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
    service: Annotated[ChatService, Depends(get_chat_service)],
) -> dict:
    return await service.complete(_command(request), scope)


@router.post("/api/chat/stream")
def chat_stream(
    request: ChatRequest,
    scope: Annotated[UserScope, Depends(current_user_scope)],
    service: Annotated[ChatService, Depends(get_chat_service)],
) -> StreamingResponse:
    command = _command(request)
    prepared = service.prepare(command, scope)
    return StreamingResponse(
        (_sse(event) for event in service.stream(command, scope, prepared)),
        media_type="text/event-stream",
    )


def _command(request: ChatRequest) -> ChatCommand:
    return ChatCommand(
        model=request.model,
        prompt=request.prompt,
        conversation_id=request.conversation_id,
        reasoning_effort=cast(ReasoningEffort | None, request.reasoning_effort),
        guardrail_comparison=request.guardrail_comparison,
        use_case=request.use_case,
    )


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"
