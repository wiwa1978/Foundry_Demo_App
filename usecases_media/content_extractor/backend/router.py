import logging

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from app.core.errors import ApplicationError, ExternalServiceError, InvalidRequestError
from usecases_media.content_extractor.backend.sample_schemas import (
    ContentExtractorSampleResponse,
)
from usecases_media.content_extractor.backend.samples import download_sample, list_samples
from usecases_media.content_extractor.backend.schemas import ContentExtractorResponse
from usecases_media.content_extractor.backend.service import (
    DEFAULT_DOCUMENT_ANALYZER,
    DOCUMENT_ANALYZERS,
    extract_audio_content,
    extract_document_content,
    extract_image_content,
)

router = APIRouter(tags=["Content Extractor"])
logger = logging.getLogger(__name__)

MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024
MAX_DOCUMENT_FILE_BYTES = 20 * 1024 * 1024
MAX_AUDIO_FILE_BYTES = 25 * 1024 * 1024

SUPPORTED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/bmp",
    "image/tiff",
}
# Document analyzers (layout, invoice, tax, fields, OCR read) also accept
# scanned images, so the document mode allows both PDFs and image types.
SUPPORTED_DOCUMENT_TYPES = SUPPORTED_IMAGE_TYPES | {"application/pdf"}
SUPPORTED_AUDIO_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
    "audio/ogg",
    "audio/webm",
    "audio/flac",
}


@router.get(
    "/api/content-extractor/samples/{mode}",
    response_model=list[ContentExtractorSampleResponse],
)
async def list_content_extractor_samples(mode: str) -> list[dict[str, str]]:
    normalized_mode = mode.strip().lower()
    if normalized_mode not in {"document", "audio"}:
        raise InvalidRequestError("Content Extractor samples support document or audio mode.")
    return await run_in_threadpool(list_samples, normalized_mode)


@router.get("/api/content-extractor/samples/{mode}/{sample_id:path}")
async def get_content_extractor_sample(mode: str, sample_id: str) -> Response:
    normalized_mode = mode.strip().lower()
    data, content_type = await run_in_threadpool(
        download_sample, normalized_mode, sample_id
    )
    return Response(
        data,
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.post(
    "/api/content-extractor/extract",
    response_model=ContentExtractorResponse,
)
async def extract(
    mode: str = Form("image"),
    analyzer: str = Form(DEFAULT_DOCUMENT_ANALYZER),
    file: UploadFile = File(...),
) -> dict:
    normalized_mode = mode.strip().lower()
    if normalized_mode not in {"image", "document", "audio"}:
        raise InvalidRequestError("Unsupported content extraction mode.")

    mime_type = (file.content_type or "").strip().lower()

    if normalized_mode == "image":
        if mime_type not in SUPPORTED_IMAGE_TYPES:
            raise InvalidRequestError("Upload a JPEG, PNG, WebP, BMP, or TIFF image.")
        max_bytes = MAX_IMAGE_FILE_BYTES
    elif normalized_mode == "document":
        if mime_type not in SUPPORTED_DOCUMENT_TYPES:
            raise InvalidRequestError("Upload a PDF, JPEG, PNG, WebP, BMP, or TIFF document.")
        max_bytes = MAX_DOCUMENT_FILE_BYTES
    else:
        if mime_type not in SUPPORTED_AUDIO_TYPES:
            raise InvalidRequestError("Upload a WAV, MP3, MP4/M4A, OGG, WebM, or FLAC audio file.")
        max_bytes = MAX_AUDIO_FILE_BYTES

    data = await file.read()
    if not data:
        raise InvalidRequestError("Upload a file to extract content.")
    if len(data) > max_bytes:
        raise InvalidRequestError(
            f"{normalized_mode.capitalize()} uploads for Content Extractor are limited to "
            f"{max_bytes // (1024 * 1024)} MB."
        )

    try:
        if normalized_mode == "image":
            return await extract_image_content(
                filename=file.filename or "image",
                mime_type=mime_type,
                data=data,
            )
        if normalized_mode == "document":
            analyzer_choice = analyzer.strip().lower() or DEFAULT_DOCUMENT_ANALYZER
            if analyzer_choice not in DOCUMENT_ANALYZERS:
                raise InvalidRequestError(
                    f"Unknown document analyzer '{analyzer_choice}'. Choose one of: "
                    f"{', '.join(sorted(DOCUMENT_ANALYZERS))}."
                )
            return await extract_document_content(
                analyzer=analyzer_choice,
                filename=file.filename or "document",
                mime_type=mime_type,
                data=data,
            )
        return await extract_audio_content(
            filename=file.filename or "audio",
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
