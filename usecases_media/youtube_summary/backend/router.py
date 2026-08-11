import logging

from fastapi import APIRouter

from app.core.errors import ApplicationError, ExternalServiceError
from usecases_media.youtube_summary.backend.schemas import (
    YouTubeSummaryRequest,
    YouTubeSummaryResponse,
)
from usecases_media.youtube_summary.backend.service import summarize_youtube_video

router = APIRouter(tags=["YouTube summary"])
logger = logging.getLogger(__name__)


@router.post("/api/youtube/summarize", response_model=YouTubeSummaryResponse)
async def summarize(request: YouTubeSummaryRequest) -> dict:
    try:
        return await summarize_youtube_video(
            url=request.url,
            model=request.model,
            transcription_model=request.transcription_model,
            language=request.language,
            reasoning_effort=request.reasoning_effort,
        )
    except ApplicationError as exc:
        logger.warning(
            "youtube_summary_rejected code=%s detail=%s",
            exc.code,
            exc.detail,
        )
        raise
    except Exception as exc:
        logger.exception("youtube_summary_failed")
        raise ExternalServiceError("YouTube summary") from exc
