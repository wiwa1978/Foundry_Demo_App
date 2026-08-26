import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.api.dependencies import chat_service as get_chat_service
from app.application.chat import ChatService
from app.core.errors import ApplicationError, ExternalServiceError, InvalidRequestError
from .schemas import CaptioningResponse, DubbingResponse, VideoTranslationResponse
from .service import (
    MAX_UPLOAD_BYTES,
    caption_media,
    translate_and_dub_audio,
    translate_and_dub_video,
)

router = APIRouter(tags=["Captioning", "Dubbing", "Video translation"])
logger = logging.getLogger(__name__)


@router.post("/api/captioning/caption", response_model=CaptioningResponse)
async def caption_media_file(
    media: Annotated[UploadFile, File(...)],
    _service: Annotated[ChatService, Depends(get_chat_service)],
    language: Annotated[str, Form()] = "en-US",
    transcription_model: Annotated[str | None, Form()] = None,
) -> dict:
    try:
        data = await media.read(MAX_UPLOAD_BYTES + 1)
        if len(data) > MAX_UPLOAD_BYTES:
            raise InvalidRequestError("Media exceeds the 100 MB upload limit.")
        return await caption_media(
            media=data,
            filename=media.filename,
            language=language,
            transcription_model=transcription_model,
        )
    except ApplicationError:
        raise
    except Exception as exc:
        logger.exception("captioning_failed")
        raise ExternalServiceError("Captioning") from exc


@router.post("/api/dubbing/dub", response_model=DubbingResponse)
async def dub_media_file(
    media: Annotated[UploadFile, File(...)],
    target_language: Annotated[str, Form(...)],
    _service: Annotated[ChatService, Depends(get_chat_service)],
    source_language: Annotated[str | None, Form()] = None,
    voice: Annotated[str | None, Form()] = None,
    transcription_model: Annotated[str | None, Form()] = None,
) -> dict:
    try:
        data = await media.read(MAX_UPLOAD_BYTES + 1)
        if len(data) > MAX_UPLOAD_BYTES:
            raise InvalidRequestError("Media exceeds the 100 MB upload limit.")
        return await translate_and_dub_audio(
            media=data,
            filename=media.filename,
            source_language=source_language,
            target_language=target_language,
            voice=voice,
            transcription_model=transcription_model,
        )
    except ApplicationError:
        raise
    except Exception as exc:
        logger.exception("dubbing_failed")
        raise ExternalServiceError("Dubbing") from exc


@router.post("/api/video-translation/translate", response_model=VideoTranslationResponse)
async def translate_video(
    video: Annotated[UploadFile, File(...)],
    target_language: Annotated[str, Form(...)],
    _service: Annotated[ChatService, Depends(get_chat_service)],
    source_language: Annotated[str | None, Form()] = None,
    voice: Annotated[str | None, Form()] = None,
    transcription_model: Annotated[str | None, Form()] = None,
) -> dict:
    try:
        data = await video.read(MAX_UPLOAD_BYTES + 1)
        if len(data) > MAX_UPLOAD_BYTES:
            raise InvalidRequestError("Video exceeds the 100 MB upload limit.")
        return await translate_and_dub_video(
            video=data, filename=video.filename, source_language=source_language,
            target_language=target_language, voice=voice, transcription_model=transcription_model)
    except ApplicationError:
        raise
    except Exception as exc:
        logger.exception("video_translation_failed")
        raise ExternalServiceError("Video translation") from exc
