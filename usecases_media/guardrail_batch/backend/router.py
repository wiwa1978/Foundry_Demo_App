import asyncio
import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.dependencies import chat_service as get_chat_service
from app.api.dependencies import current_user_scope
from app.application.chat import ChatService
from app.application.guardrail_batch import batch_policy_names
from app.application.models import get_model_settings
from app.core.errors import InvalidRequestError
from app.domain.identity import UserScope
from app.domain.models import DEPLOYMENT_DEFAULT_GUARDRAIL, ModelSettings
from usecases_media.guardrail_batch.backend.schemas import (
    GuardrailBatchRequest,
    GuardrailBatchStatementResult,
)

router = APIRouter(tags=["Guardrail Batch"])


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _resolve_settings(service: ChatService, model: str) -> ModelSettings:
    settings = get_model_settings(service.models, model)
    if len(settings.guardrail_policy_names) != 2:
        raise InvalidRequestError(
            f"Batch evaluation needs two guardrails selected for {settings.model}."
        )
    return settings


async def _evaluate_statement(
    service: ChatService,
    settings: ModelSettings,
    index: int,
    statement: str,
) -> GuardrailBatchStatementResult:
    policy_names = batch_policy_names(settings)
    results = await asyncio.gather(
        *(
            asyncio.to_thread(
                service.evaluate_guardrail_statement,
                model_settings=settings,
                statement=statement,
                policy_name=policy_name,
            )
            for policy_name in policy_names
        )
    )
    return GuardrailBatchStatementResult(
        index=index,
        statement=statement,
        results=[
            {
                **result,
                "policy_name": settings.guardrail_policy_names[position],
            }
            for position, result in enumerate(results)
        ],
    )


@router.post("/api/guardrails/batch/stream")
def evaluate_guardrail_batch(
    request: GuardrailBatchRequest,
    scope: Annotated[UserScope, Depends(current_user_scope)],
    service: Annotated[ChatService, Depends(get_chat_service)],
) -> StreamingResponse:
    settings = _resolve_settings(service, request.model)
    statements = request.statements

    async def events():
        yield {
            "type": "start",
            "model": settings.model,
            "total": len(statements),
            "policy_names": list(settings.guardrail_policy_names),
            "deployment_default_guardrail": DEPLOYMENT_DEFAULT_GUARDRAIL,
        }

        limiter = asyncio.Semaphore(request.concurrency)

        async def run(index: int, statement: str) -> GuardrailBatchStatementResult:
            async with limiter:
                return await _evaluate_statement(service, settings, index, statement)

        tasks = [
            asyncio.create_task(run(index, statement))
            for index, statement in enumerate(statements)
        ]
        try:
            for completed in asyncio.as_completed(tasks):
                result = await completed
                yield {"type": "statement_completed", "result": result.model_dump()}
        finally:
            for task in tasks:
                task.cancel()

        yield {"type": "completed", "total": len(statements)}

    async def encoded_events():
        async for event in events():
            yield _sse(event)

    return StreamingResponse(encoded_events(), media_type="text/event-stream")
