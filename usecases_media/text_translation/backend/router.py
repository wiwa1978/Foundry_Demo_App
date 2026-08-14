import logging

from fastapi import APIRouter

from app.core.errors import ApplicationError, ExternalServiceError
from usecases_media.text_translation.backend.schemas import (
    TextTranslationRequest,
    TextTranslationResponse,
)
from usecases_media.text_translation.backend.service import translate_text

router = APIRouter(tags=["Text Translation"])
logger = logging.getLogger(__name__)


@router.post(
    "/api/text-translation/translate",
    response_model=TextTranslationResponse,
)
async def translate(request: TextTranslationRequest) -> dict:
    try:
        return await translate_text(request)
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
