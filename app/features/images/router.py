import logging
from typing import Annotated

from fastapi import APIRouter, File, Form, UploadFile

from app.concurrency import run_model_call
from app.errors import ExternalServiceError, InvalidRequestError
from app.features.images.schemas import ImageResponse
from app.model_settings import get_model_settings
from app.providers.images import edit_image, generate_image
from app.schemas import ImageGenerationRequest

router = APIRouter(tags=["Images"])
logger = logging.getLogger(__name__)


@router.post("/api/images/generate", response_model=ImageResponse)
async def generate(request: ImageGenerationRequest) -> dict:
    configured_for_images = "image" in get_model_settings(request.model).modalities
    if not configured_for_images and not any(
        token in request.model.lower() for token in ("mai-image", "flux")
    ):
        raise InvalidRequestError(
            f"{request.model} is not configured with the image capability."
        )
    try:
        return dict(
            await run_model_call(
                generate_image,
                model=request.model,
                prompt=request.prompt,
                width=request.width,
                height=request.height,
            )
        )
    except Exception as exc:
        logger.exception("image_generation_failed")
        raise ExternalServiceError("Image generation") from exc


@router.post("/api/images/edit", response_model=ImageResponse)
async def edit(
    image: Annotated[UploadFile, File()],
    model: Annotated[str, Form(min_length=1)],
    prompt: Annotated[str, Form(min_length=1)],
    width: Annotated[int, Form(ge=768)] = 1024,
    height: Annotated[int, Form(ge=768)] = 1024,
) -> dict:
    model, prompt = model.strip(), prompt.strip()
    if not model or not prompt:
        raise InvalidRequestError("Model and prompt cannot be blank.")
    if width * height > 1_048_576:
        raise InvalidRequestError(
            "Image dimensions cannot exceed 1,048,576 total pixels."
        )
    if "gpt-image" not in model.lower():
        raise InvalidRequestError(f"{model} does not support image editing.")
    if image.content_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise InvalidRequestError("Source image must be a PNG, JPEG, or WebP file.")
    image_bytes = await image.read(10 * 1024 * 1024 + 1)
    if not image_bytes:
        raise InvalidRequestError("Source image cannot be empty.")
    if len(image_bytes) > 10 * 1024 * 1024:
        raise InvalidRequestError("Source image cannot exceed 10 MB.")
    try:
        return dict(
            await run_model_call(
                edit_image,
                model=model,
                prompt=prompt,
                image=image_bytes,
                image_content_type=image.content_type,
                width=width,
                height=height,
            )
        )
    except Exception as exc:
        logger.exception("image_editing_failed")
        raise ExternalServiceError("Image editing") from exc
