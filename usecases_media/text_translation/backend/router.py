import logging
from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencies import chat_service as get_chat_service
from app.application.chat import ChatService
from app.application.models import get_model_settings
from app.core.errors import ApplicationError, ExternalServiceError
from usecases_media.text_translation.backend.schemas import (
    TextTranslationRequest,
    TextTranslationResponse,
)
from usecases_media.text_translation.backend.service import (
    analyze_text,
    translate_text,
    translate_text_with_llm,
)

router = APIRouter(tags=["Text Translation"])
logger = logging.getLogger(__name__)


@router.post(
    "/api/text-translation/translate",
    response_model=TextTranslationResponse,
)
async def translate(
    request: TextTranslationRequest,
    service: Annotated[ChatService, Depends(get_chat_service)],
) -> dict:
    try:
        if request.mode != "translator_text":
            return await analyze_text(request)
        if request.uses_azure_mt:
            return await translate_text(request)
        return await translate_text_with_llm(
            request,
            model=request.model,
            gateway=service.gateway,
            model_settings=get_model_settings(service.models, request.model),
        )
    except ApplicationError as exc:
        logger.warning(
            "text_translation_rejected code=%s detail=%s",
            exc.code,
            exc.detail,
        )
        raise
    except Exception as exc:
        logger.exception("text_translation_failed")
        raise ExternalServiceError("Text translation") from exc
