import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends

from app.conversation_store import (
    append_message,
    build_model_history,
    conversation_to_dict,
    get_conversation,
    get_or_create_conversation,
    message_to_dict,
)
from app.errors import ExternalServiceError
from app.features.comparison.schemas import ComparisonResponse
from app.features.dependencies import current_user_scope
from app.model_settings import get_model_settings
from app.schemas import CompareRequest
from app.security import UserScope
from app.services.chat import chat_service

router = APIRouter(tags=["Comparison"])


@router.post(
    "/api/compare",
    response_model=ComparisonResponse,
    response_model_exclude_unset=True,
)
async def compare(
    request: CompareRequest,
    scope: Annotated[UserScope, Depends(current_user_scope)],
) -> dict:
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

    async def run_model(model: str) -> dict:
        model_settings = settings[model]
        results = await asyncio.gather(
            *(
                asyncio.to_thread(
                    chat_service.run_and_store_variant,
                    scope=scope,
                    conversation_id=conversation.id,
                    model_settings=model_settings,
                    prompt=request.prompt,
                    system_prompt=model_settings.system_prompt,
                    reasoning_effort=request.reasoning_effort,
                    history=histories[(model, variant)],
                    variant=variant,
                    policy_name=policy_name,
                )
                for variant, policy_name in variants[model]
            )
        )
        return results[0] if len(results) == 1 else {
            "model": model,
            "guardrail_comparison": True,
            "guardrail_policy_names": list(model_settings.guardrail_policy_names),
            "variants": results,
        }

    results = await asyncio.gather(*(run_model(model) for model in request.models))
    if any(
        result.get("error")
        or any(variant.get("error") for variant in result.get("variants", []))
        for result in results
    ):
        raise ExternalServiceError("Model comparison")
    return {
        "conversation": conversation_to_dict(get_conversation(scope, conversation.id) or conversation),
        "user_message": message_to_dict(user_message),
        "results": results,
    }
