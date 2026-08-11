from collections.abc import Iterator
from contextlib import contextmanager
from urllib.parse import urlparse

from azure.identity import get_bearer_token_provider
from openai import AzureOpenAI, OpenAI

from app.infrastructure.azure.credentials import get_azure_credential
from app.infrastructure.azure.foundry.settings import FoundrySettings


def normalize_endpoint(endpoint_value: str) -> str:
    endpoint = endpoint_value.strip().rstrip("/")
    if not endpoint:
        raise RuntimeError("FOUNDRY_PROJECT_ENDPOINT must be configured.")
    if endpoint.endswith("/models"):
        raise RuntimeError(
            "FOUNDRY_PROJECT_ENDPOINT must be a Foundry project endpoint like "
            "https://<resource-name>.services.ai.azure.com/api/projects/<project-name>, "
            "not the legacy /models inference endpoint."
        )
    parsed = urlparse(endpoint)
    if parsed.scheme and (parsed.scheme.lower() != "https" or not parsed.netloc):
        raise RuntimeError("FOUNDRY_PROJECT_ENDPOINT must be an absolute HTTPS endpoint.")
    if "://" in endpoint or "/" in endpoint:
        if parsed.scheme.lower() != "https" or not parsed.netloc:
            raise RuntimeError("FOUNDRY_PROJECT_ENDPOINT must be an absolute HTTPS endpoint.")
    return endpoint


def openai_base_url(endpoint_value: str) -> str:
    endpoint = normalize_endpoint(endpoint_value)
    if "://" not in endpoint and "/" not in endpoint:
        return f"https://{endpoint}.services.ai.azure.com/openai/v1"

    parsed = urlparse(endpoint)
    if parsed.scheme.lower() != "https" or not parsed.netloc:
        raise RuntimeError(
            "FOUNDRY_PROJECT_ENDPOINT must be a Foundry project endpoint like "
            "https://<resource-name>.services.ai.azure.com/api/projects/<project-name>."
        )

    path = parsed.path.rstrip("/")
    if path.endswith("/openai/v1"):
        base_path = path
    elif "/api/projects/" in path:
        base_path = "/openai/v1"
    elif path.endswith("/openai"):
        base_path = f"{path}/v1"
    elif not path:
        base_path = "/openai/v1"
    else:
        base_path = f"{path}/openai/v1"
    return f"https://{parsed.netloc}{base_path}"


def azure_openai_endpoint(endpoint_value: str) -> str:
    endpoint = normalize_endpoint(endpoint_value)
    parsed = urlparse(endpoint)
    if parsed.scheme.lower() != "https" or not parsed.netloc:
        raise RuntimeError(
            "FOUNDRY_PROJECT_ENDPOINT must be a Foundry project endpoint like "
            "https://<resource-name>.services.ai.azure.com/api/projects/<project-name>."
        )

    hostname = parsed.hostname or ""
    if hostname.endswith(".services.ai.azure.com"):
        hostname = f"{hostname.removesuffix('.services.ai.azure.com')}.openai.azure.com"
    return f"https://{hostname}"


@contextmanager
def create_openai_client(settings: FoundrySettings) -> Iterator[OpenAI]:
    endpoint = normalize_endpoint(settings.endpoint or "")
    token_provider = get_bearer_token_provider(
        get_azure_credential(),
        "https://ai.azure.com/.default",
    )
    with OpenAI(
        base_url=openai_base_url(endpoint),
        api_key=token_provider,
    ) as openai_client:
        yield openai_client


@contextmanager
def create_audio_client(settings: FoundrySettings) -> Iterator[AzureOpenAI]:
    token_provider = get_bearer_token_provider(
        get_azure_credential(),
        "https://cognitiveservices.azure.com/.default",
    )
    with AzureOpenAI(
        azure_endpoint=azure_openai_endpoint(settings.endpoint or ""),
        api_version="2025-04-01-preview",
        azure_ad_token_provider=token_provider,
    ) as openai_client:
        yield openai_client
