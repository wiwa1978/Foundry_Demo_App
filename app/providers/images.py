import base64
import json
import time
import uuid
from typing import Any, TypedDict, cast
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse

from app.azure_credential import get_azure_credential
from app.providers.clients import normalize_endpoint, openai_base_url
from app.providers.http import build_checked_request, open_checked_url
from app.providers.settings import load_settings


class ImageResult(TypedDict):
    model: str
    image_base64: str
    mime_type: str
    width: int
    height: int
    duration_ms: int


class ImagePromptRejectedError(RuntimeError):
    pass


def generate_image(*, model: str, prompt: str, width: int, height: int) -> ImageResult:
    settings = load_settings()
    if not settings.is_configured:
        raise RuntimeError(
            "Foundry is not configured. Set FOUNDRY_PROJECT_ENDPOINT in .env."
        )

    normalized_model = model.strip().lower()
    is_mai_model = "mai-image" in normalized_model
    is_flux_model = "flux" in normalized_model
    if is_flux_model:
        url = (
            f"{_flux_base_url(settings.flux_endpoint or settings.endpoint or '')}"
            "/providers/blackforestlabs/v1/"
            f"{_flux_model_path(normalized_model)}?api-version=preview"
        )
        credential_scope = "https://cognitiveservices.azure.com/.default"
        payload = {
            "model": normalized_model,
            "prompt": prompt,
            "width": width,
            "height": height,
            "output_format": "jpeg",
            "n": 1,
        }
        api_name = "FLUX"
        output_width, output_height = width, height
        mime_type = "image/jpeg"
    elif is_mai_model:
        endpoint = normalize_endpoint(settings.endpoint or "")
        parsed = urlparse(endpoint)
        url = f"{parsed.scheme}://{parsed.netloc}/mai/v1/images/generations"
        credential_scope = "https://cognitiveservices.azure.com/.default"
        payload = {
            "model": model,
            "prompt": prompt,
            "width": width,
            "height": height,
        }
        api_name = "MAI"
        output_width, output_height = width, height
        mime_type = "image/png"
    else:
        url = f"{openai_base_url(settings.endpoint or '')}/images/generations"
        credential_scope = "https://ai.azure.com/.default"
        size = _openai_image_size(width, height)
        payload = {
            "model": model,
            "prompt": prompt,
            "size": size,
        }
        api_name = "OpenAI"
        output_width, output_height = (int(value) for value in size.split("x"))
        mime_type = "image/png"

    token = get_azure_credential().get_token(credential_scope).token
    request = build_checked_request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    started = time.perf_counter()
    try:
        with open_checked_url(request, timeout=180) as response:
            result = cast(dict[str, Any], json.loads(response.read().decode("utf-8")))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            error = cast(dict[str, Any], json.loads(detail))
            detail = error.get("error", {}).get("message") or error.get("detail") or detail
        except json.JSONDecodeError:
            pass
        if _is_prompt_policy_rejection(detail):
            raise ImagePromptRejectedError(
                "The image provider rejected this prompt under its content policy. "
                "Revise the prompt and try again."
            ) from exc
        raise RuntimeError(f"{api_name} image generation failed ({exc.code}): {detail}") from exc
    except URLError as exc:
        raise RuntimeError(
            f"Could not reach the {api_name} image generation endpoint: {exc.reason}"
        ) from exc

    image_base64, response_mime_type = _extract_generated_image(result)
    if image_base64 is None:
        raise RuntimeError(f"{api_name} image generation returned no image data.")
    return {
        "model": model,
        "image_base64": image_base64,
        "mime_type": response_mime_type or mime_type,
        "width": output_width,
        "height": output_height,
        "duration_ms": round((time.perf_counter() - started) * 1000),
    }


def _flux_base_url(endpoint_value: str) -> str:
    parsed = urlparse(normalize_endpoint(endpoint_value))
    if not parsed.scheme or not parsed.hostname:
        raise RuntimeError("FOUNDRY_PROJECT_ENDPOINT must be a valid Foundry endpoint.")
    return f"{parsed.scheme}://{parsed.netloc}"


def _flux_model_path(normalized_model: str) -> str:
    if any(token in normalized_model for token in ("flux.2-pro", "flux-2-pro", "flux.2_pro")):
        return "flux-2-pro"
    if any(
        token in normalized_model for token in ("flux.2-flex", "flux-2-flex", "flux.2_flex")
    ):
        return "flux-2-flex"
    if "kontext" in normalized_model:
        return "flux-kontext-pro"
    if "1.1" in normalized_model or "1-1" in normalized_model:
        return "flux-pro-1.1"
    raise RuntimeError(f"Unsupported FLUX image deployment: {normalized_model}.")


def _is_prompt_policy_rejection(detail: str) -> bool:
    normalized_detail = detail.casefold()
    return any(
        marker in normalized_detail
        for marker in (
            "bingblocklist_prompt",
            "content_policy_violation",
            "content violated rai policy",
            "prompt was filtered",
            "request was rejected by the safety system",
        )
    )


def _extract_generated_image(result: dict[str, Any]) -> tuple[str | None, str | None]:
    candidates = result.get("data", [])
    if isinstance(candidates, dict):
        candidates = [candidates]
    if not candidates:
        candidates = [result]
    if not isinstance(candidates, list):
        return None, None
    for image in candidates:
        if not isinstance(image, dict):
            continue
        encoded = image.get("b64_json") or image.get("base64") or image.get("image")
        if isinstance(encoded, str) and encoded:
            response_mime_type = image.get("mime_type") or image.get("content_type")
            return encoded, cast(str | None, response_mime_type)
        image_url = image.get("url")
        if isinstance(image_url, str) and image_url:
            with open_checked_url(image_url, timeout=180) as response:
                content_type = response.headers.get_content_type()
                return base64.b64encode(response.read()).decode("ascii"), content_type
    return None, None


def edit_image(
    *,
    model: str,
    prompt: str,
    image: bytes,
    image_content_type: str,
    width: int,
    height: int,
) -> ImageResult:
    settings = load_settings()
    if not settings.is_configured:
        raise RuntimeError(
            "Foundry is not configured. Set FOUNDRY_PROJECT_ENDPOINT in .env."
        )

    size = _openai_image_size(width, height)
    boundary = f"foundry-chat-{uuid.uuid4().hex}"
    fields = {"model": model, "prompt": prompt, "size": size}
    parts: list[bytes] = []
    for name, value in fields.items():
        parts.append(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
                f"{value}\r\n"
            ).encode()
        )
    parts.extend(
        [
            (
                f"--{boundary}\r\n"
                'Content-Disposition: form-data; name="image"; filename="source-image"\r\n'
                f"Content-Type: {image_content_type}\r\n\r\n"
            ).encode(),
            image,
            b"\r\n",
            f"--{boundary}--\r\n".encode(),
        ]
    )

    token = get_azure_credential().get_token("https://ai.azure.com/.default").token
    request = build_checked_request(
        f"{openai_base_url(settings.endpoint or '')}/images/edits",
        data=b"".join(parts),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    started = time.perf_counter()
    try:
        with open_checked_url(request, timeout=180) as response:
            result = cast(dict[str, Any], json.loads(response.read().decode("utf-8")))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            error = cast(dict[str, Any], json.loads(detail))
            detail = error.get("error", {}).get("message") or error.get("detail") or detail
        except json.JSONDecodeError:
            pass
        raise RuntimeError(f"OpenAI image edit failed ({exc.code}): {detail}") from exc
    except URLError as exc:
        raise RuntimeError(
            f"Could not reach the OpenAI image edit endpoint: {exc.reason}"
        ) from exc

    data = result.get("data", [])
    edited_image = next(
        (
            item
            for item in data
            if isinstance(item, dict) and isinstance(item.get("b64_json"), str)
        ),
        None,
    ) if isinstance(data, list) else None
    if edited_image is None:
        raise RuntimeError("OpenAI image edit returned no image data.")
    image_base64 = edited_image["b64_json"]
    output_width, output_height = (int(value) for value in size.split("x"))
    return {
        "model": model,
        "image_base64": image_base64,
        "mime_type": "image/png",
        "width": output_width,
        "height": output_height,
        "duration_ms": round((time.perf_counter() - started) * 1000),
    }


def _openai_image_size(width: int, height: int) -> str:
    if width == height:
        return "1024x1024"
    if width > height:
        return "1536x1024"
    return "1024x1536"
