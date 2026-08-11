import asyncio
import json
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.dependencies import current_user_scope
from app.api.schemas import CompareRequest
from app.application.chat import chat_service
from app.application.conversations import (
    append_message,
    build_model_history,
    conversation_to_dict,
    get_conversation,
    get_or_create_conversation,
    message_to_dict,
)
from app.application.models import get_model_settings
from app.core.errors import ExternalServiceError
from app.domain.identity import UserScope
from usecases_media.text_chat_comparison.backend.schemas import ComparisonResponse

router = APIRouter(tags=["Comparison"])


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _prepare_comparison(request: CompareRequest, scope: UserScope) -> dict:
    conversation = get_or_create_conversation(
        scope, request.conversation_id, request.prompt, request.use_case
    )
    settings = {model: get_model_settings(model) for model in request.models}
    variants = {
        model: chat_service.guardrail_variants(model_settings, False)
        for model, model_settings in settings.items()
    }
    histories = {
        (model, variant): build_model_history(
            scope, conversation.id, model, variant, policy_name
        )
        for model, options in variants.items()
        for variant, policy_name in options
    }
    user_message = append_message(
        scope=scope,
        conversation_id=conversation.id,
        role="user",
        content=request.prompt,
    )
    return {
        "conversation": conversation,
        "settings": settings,
        "variants": variants,
        "histories": histories,
        "user_message": user_message,
    }


async def _run_model(
    request: CompareRequest, scope: UserScope, prepared: dict, model: str
) -> dict:
    model_settings = prepared["settings"][model]
    results = await asyncio.gather(
        *(
            asyncio.to_thread(
                chat_service.run_and_store_variant,
                scope=scope,
                conversation_id=prepared["conversation"].id,
                model_settings=model_settings,
                prompt=request.prompt,
                system_prompt=model_settings.system_prompt,
                reasoning_effort=request.reasoning_effort,
                history=prepared["histories"][(model, variant)],
                variant=variant,
                policy_name=policy_name,
            )
            for variant, policy_name in prepared["variants"][model]
        )
    )
    return results[0] if len(results) == 1 else {
        "model": model,
        "guardrail_comparison": True,
        "guardrail_policy_names": list(model_settings.guardrail_policy_names),
        "variants": results,
    }


@router.post(
    "/api/compare",
    response_model=ComparisonResponse,
    response_model_exclude_unset=True,
)
async def compare(
    request: CompareRequest,
    scope: Annotated[UserScope, Depends(current_user_scope)],
) -> dict:
    prepared = _prepare_comparison(request, scope)
    conversation = prepared["conversation"]
    results = await asyncio.gather(
        *(_run_model(request, scope, prepared, model) for model in request.models)
    )
    if any(
        result.get("error")
        or any(variant.get("error") for variant in result.get("variants", []))
        for result in results
    ):
        raise ExternalServiceError("Model comparison")
    return {
        "conversation": conversation_to_dict(get_conversation(scope, conversation.id) or conversation),
        "user_message": message_to_dict(prepared["user_message"]),
        "results": results,
    }


@router.post("/api/compare/stream")
def compare_stream(
    request: CompareRequest,
    scope: Annotated[UserScope, Depends(current_user_scope)],
) -> StreamingResponse:
    prepared = _prepare_comparison(request, scope)
    conversation = prepared["conversation"]

    async def events():
        yield {
            "type": "start",
            "conversation": conversation_to_dict(conversation),
            "user_message": message_to_dict(prepared["user_message"]),
        }

        async def run(model: str):
            return model, await _run_model(request, scope, prepared, model)

        tasks = [asyncio.create_task(run(model)) for model in request.models]
        for completed in asyncio.as_completed(tasks):
            model, result = await completed
            yield {"type": "model_completed", "model": model, "result": result}

        yield {
            "type": "completed",
            "conversation": conversation_to_dict(
                get_conversation(scope, conversation.id) or conversation
            ),
        }

    async def encoded_events():
        async for event in events():
            yield _sse(event)

    return StreamingResponse(encoded_events(), media_type="text/event-stream")
