import logging
import os
from typing import Annotated

from azure.core.exceptions import HttpResponseError, ResourceNotFoundError, ServiceRequestError
from azure.storage.blob import BlobServiceClient
from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from app.azure_credential import get_azure_credential
from app.concurrency import run_model_call
from app.errors import ExternalServiceError, InvalidRequestError
from app.features.images.schemas import ImageResponse, ImageSampleResponse
from app.model_settings import get_model_settings
from app.providers.images import ImagePromptRejectedError, edit_image, generate_image
from app.schemas import ImageGenerationRequest

router = APIRouter(tags=["Images"])
logger = logging.getLogger(__name__)
IMAGE_SAMPLE_PREFIX = "image-samples/"


def _sample_container_client():
    account_url = os.getenv("AZURE_STORAGE_ACCOUNT_URL", "").strip()
    container_name = os.getenv("AZURE_STORAGE_CONTAINER_NAME", "").strip()
    if not account_url or not container_name:
        raise InvalidRequestError("Image samples are not configured.")
    service = BlobServiceClient(
        account_url=account_url,
        credential=get_azure_credential(),
        connection_timeout=3,
        read_timeout=5,
        retry_total=0,
    )
    return service, service.get_container_client(container_name)


def _list_samples() -> list[dict[str, str]]:
    if not os.getenv("AZURE_STORAGE_ACCOUNT_URL", "").strip() or not os.getenv(
        "AZURE_STORAGE_CONTAINER_NAME", ""
    ).strip():
        return []
    service, container = _sample_container_client()
    try:
        samples = []
        for blob in container.list_blobs(name_starts_with=IMAGE_SAMPLE_PREFIX, include=["metadata"]):
            if not blob.name.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                continue
            metadata = blob.metadata or {}
            sample_id = blob.name.removeprefix(IMAGE_SAMPLE_PREFIX)
            samples.append(
                {
                    "id": sample_id,
                    "name": metadata.get("title", sample_id.rsplit(".", 1)[0].replace("-", " ").title()),
                    "attribution": metadata.get("attribution", ""),
                    "source_url": metadata.get("source_url", ""),
                    "image_url": f"/api/images/samples/{sample_id}",
                }
            )
        return sorted(samples, key=lambda sample: sample["name"])
    except (HttpResponseError, ServiceRequestError) as exc:
        logger.warning("image_sample_storage_unavailable error=%s", type(exc).__name__)
        return []
    finally:
        service.close()


def _download_sample(sample_id: str) -> tuple[bytes, str]:
    if not sample_id or sample_id != sample_id.rsplit("/", 1)[-1] or ".." in sample_id:
        raise InvalidRequestError("Invalid image sample.")
    service, container = _sample_container_client()
    try:
        blob = container.get_blob_client(f"{IMAGE_SAMPLE_PREFIX}{sample_id}")
        properties = blob.get_blob_properties()
        content_type = properties.content_settings.content_type or "application/octet-stream"
        return blob.download_blob(max_concurrency=1).readall(), content_type
    except ResourceNotFoundError as exc:
        raise InvalidRequestError("Image sample was not found.") from exc
    except (HttpResponseError, ServiceRequestError) as exc:
        logger.warning("image_sample_storage_unavailable error=%s", type(exc).__name__)
        raise InvalidRequestError("Image samples are currently unavailable.") from exc
    finally:
        service.close()


@router.get("/api/images/samples", response_model=list[ImageSampleResponse])
async def list_image_samples() -> list[dict[str, str]]:
    return await run_in_threadpool(_list_samples)


@router.get("/api/images/samples/{sample_id}")
async def get_image_sample(sample_id: str) -> Response:
    data, content_type = await run_in_threadpool(_download_sample, sample_id)
    return Response(data, media_type=content_type, headers={"Cache-Control": "private, max-age=3600"})


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
    except ImagePromptRejectedError as exc:
        logger.info("image_prompt_rejected", extra={"model": request.model})
        raise InvalidRequestError(str(exc)) from exc
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
