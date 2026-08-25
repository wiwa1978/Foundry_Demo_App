import logging
import os

from azure.core.exceptions import HttpResponseError, ResourceNotFoundError, ServiceRequestError
from azure.storage.blob import BlobServiceClient

from app.core.errors import InvalidRequestError
from app.infrastructure.azure.credentials import get_azure_credential

logger = logging.getLogger(__name__)

SAMPLE_PREFIXES = {
    "document": "document-samples/",
    "audio": "audio-samples/",
}
SUPPORTED_SAMPLE_TYPES = {
    "document": (".pdf", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"),
    "audio": (".wav", ".mp3", ".m4a", ".mp4", ".ogg", ".webm", ".flac"),
}


def _sample_container_client():
    account_url = os.getenv("AZURE_STORAGE_ACCOUNT_URL", "").strip()
    container_name = os.getenv("AZURE_STORAGE_CONTAINER_NAME", "").strip()
    if not account_url or not container_name:
        raise InvalidRequestError("Content Extractor samples are not configured.")
    service = BlobServiceClient(
        account_url=account_url,
        credential=get_azure_credential(),
        connection_timeout=3,
        read_timeout=5,
        retry_total=0,
    )
    return service, service.get_container_client(container_name)


def list_samples(mode: str) -> list[dict[str, str]]:
    prefix = SAMPLE_PREFIXES[mode]
    if not os.getenv("AZURE_STORAGE_ACCOUNT_URL", "").strip() or not os.getenv(
        "AZURE_STORAGE_CONTAINER_NAME", ""
    ).strip():
        return []
    service, container = _sample_container_client()
    try:
        samples = []
        for blob in container.list_blobs(name_starts_with=prefix, include=["metadata"]):
            sample_id = blob.name.removeprefix(prefix)
            if not sample_id.lower().endswith(SUPPORTED_SAMPLE_TYPES[mode]):
                continue
            metadata = blob.metadata or {}
            samples.append(
                {
                    "id": sample_id,
                    "name": metadata.get(
                        "title", sample_id.rsplit(".", 1)[0].replace("-", " ").title()
                    ),
                    "description": metadata.get("description", ""),
                    "sample_url": f"/api/content-extractor/samples/{mode}/{sample_id}",
                }
            )
        return sorted(samples, key=lambda sample: sample["name"])
    except (HttpResponseError, ServiceRequestError) as exc:
        logger.warning(
            "content_extractor_sample_storage_unavailable mode=%s error=%s",
            mode,
            type(exc).__name__,
        )
        return []
    finally:
        service.close()


def download_sample(mode: str, sample_id: str) -> tuple[bytes, str]:
    if mode not in SAMPLE_PREFIXES or not sample_id or sample_id != sample_id.rsplit("/", 1)[-1]:
        raise InvalidRequestError("Invalid Content Extractor sample.")
    prefix = SAMPLE_PREFIXES[mode]
    service, container = _sample_container_client()
    try:
        blob = container.get_blob_client(f"{prefix}{sample_id}")
        properties = blob.get_blob_properties()
        content_type = properties.content_settings.content_type or "application/octet-stream"
        return blob.download_blob(max_concurrency=1).readall(), content_type
    except ResourceNotFoundError as exc:
        raise InvalidRequestError("Content Extractor sample was not found.") from exc
    except (HttpResponseError, ServiceRequestError) as exc:
        logger.warning(
            "content_extractor_sample_storage_unavailable mode=%s error=%s",
            mode,
            type(exc).__name__,
        )
        raise InvalidRequestError("Content Extractor samples are currently unavailable.") from exc
    finally:
        service.close()
