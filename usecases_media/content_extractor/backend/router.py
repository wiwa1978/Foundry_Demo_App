import logging

from fastapi import APIRouter, File, Form, UploadFile

from app.core.errors import ApplicationError, ExternalServiceError, InvalidRequestError
from usecases_media.content_extractor.backend.schemas import ContentExtractorResponse
from usecases_media.content_extractor.backend.service import extract_image_content

router = APIRouter(tags=["Content Extractor"])
logger = logging.getLogger(__name__)

MAX_CONTENT_EXTRACTOR_FILE_BYTES = 10 * 1024 * 1024
SUPPORTED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/bmp",
    "image/tiff",
}


@router.post(
    "/api/content-extractor/extract",
    response_model=ContentExtractorResponse,
)
async def extract(
    mode: str = Form("image"),
    file: UploadFile = File(...),
) -> dict:
    normalized_mode = mode.strip().lower()
    if normalized_mode != "image":
        raise InvalidRequestError("Only image extraction is available in this use case right now.")
    mime_type = (file.content_type or "").strip().lower()
    if mime_type not in SUPPORTED_IMAGE_TYPES:
        raise InvalidRequestError("Upload a JPEG, PNG, WebP, BMP, or TIFF image.")
    data = await file.read()
    if not data:
        raise InvalidRequestError("Upload an image file to extract content.")
    if len(data) > MAX_CONTENT_EXTRACTOR_FILE_BYTES:
        raise InvalidRequestError("Image uploads for Content Extractor are limited to 10 MB.")
    try:
        return await extract_image_content(
            filename=file.filename or "image",
            mime_type=mime_type,
            data=data,
        )
    except ApplicationError as exc:
        logger.warning(
            "content_extractor_rejected code=%s detail=%s",
            exc.code,
            exc.detail,
        )
        raise
    except Exception as exc:
        logger.exception("content_extractor_failed")
        raise ExternalServiceError("Content extraction") from exc
