"""Conversation history and usage-metrics endpoints.

All routes are scoped to the calling tenant/user; the repository layer enforces isolation.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.api.dependencies import conversation_service as get_conversation_service
from app.api.dependencies import current_user_scope
from app.api.features.conversations.schemas import (
    ConversationDetailResponse,
    ConversationListResponse,
    ModelMetricsResponse,
)
from app.api.features.shared_schemas import DeletedResponse
from app.application.conversation_metrics import UsageMetrics
from app.application.conversations import (
    ConversationService,
    conversation_to_dict,
    message_to_dict,
)
from app.core.config import env_float
from app.core.errors import NotFoundError
from app.core.observability import audit_event
from app.domain.identity import UserScope

router = APIRouter(tags=["conversations"])

DEFAULT_USE_CASE = "text_chat"
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 100
DEFAULT_METRICS_DAYS = 7
MAX_METRICS_DAYS = 31
CONVERSATION_NOT_FOUND = "Conversation not found."


def _token_cost(name: str) -> float:
    return env_float(name, minimum=0)


@router.get("/api/conversations", response_model=ConversationListResponse)
def get_conversations(
    scope: Annotated[UserScope, Depends(current_user_scope)],
    service: Annotated[ConversationService, Depends(get_conversation_service)],
    use_case: str = Query(DEFAULT_USE_CASE),
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
    cursor: str | None = None,
) -> dict:
    page = service.list_page(scope, use_case=use_case, limit=limit, cursor=cursor)
    return {
        "conversations": [conversation_to_dict(item) for item in page.conversations],
        "next_cursor": page.next_cursor,
    }


@router.post(
    "/api/conversations",
    response_model=ConversationDetailResponse,
    response_model_exclude_unset=True,
)
def post_conversation(
    scope: Annotated[UserScope, Depends(current_user_scope)],
    service: Annotated[ConversationService, Depends(get_conversation_service)],
    use_case: str = Query(DEFAULT_USE_CASE),
) -> dict:
    conversation = service.create(scope, use_case=use_case)
    return {"conversation": conversation_to_dict(conversation), "messages": []}


@router.get(
    "/api/conversations/{conversation_id}",
    response_model=ConversationDetailResponse,
    response_model_exclude_unset=True,
)
def get_conversation_by_id(
    conversation_id: str,
    scope: Annotated[UserScope, Depends(current_user_scope)],
    service: Annotated[ConversationService, Depends(get_conversation_service)],
    use_case: str = Query(DEFAULT_USE_CASE),
) -> dict:
    conversation = service.get(scope, conversation_id)
    if conversation is None:
        raise NotFoundError(CONVERSATION_NOT_FOUND)
    if conversation.use_case != use_case:
        raise NotFoundError("Conversation not found for this use case.")
    messages = service.messages(scope, conversation_id)
    return {
        "conversation": conversation_to_dict(conversation),
        "messages": [message_to_dict(message) for message in messages],
    }


@router.delete("/api/conversations/{conversation_id}", response_model=DeletedResponse)
def delete_conversation_by_id(
    conversation_id: str,
    scope: Annotated[UserScope, Depends(current_user_scope)],
    request: Request,
    service: Annotated[ConversationService, Depends(get_conversation_service)],
) -> dict:
    if not service.delete(scope, conversation_id):
        raise NotFoundError(CONVERSATION_NOT_FOUND)
    audit_event("conversation_deleted", request=request, conversation_id=conversation_id)
    return {"deleted": True}


@router.get("/api/metrics/model", response_model=ModelMetricsResponse)
def get_model_usage_metrics(
    scope: Annotated[UserScope, Depends(current_user_scope)],
    service: Annotated[ConversationService, Depends(get_conversation_service)],
    days: Annotated[int, Query(ge=1, le=MAX_METRICS_DAYS)] = DEFAULT_METRICS_DAYS,
    model: str | None = None,
) -> UsageMetrics:
    normalized_model = model.strip() if model else None
    return service.usage_metrics(
        scope=scope,
        days=days,
        model=normalized_model or None,
        input_token_cost_per_1k=_token_cost("FOUNDRY_INPUT_TOKEN_COST_PER_1K"),
        output_token_cost_per_1k=_token_cost("FOUNDRY_OUTPUT_TOKEN_COST_PER_1K"),
    )
