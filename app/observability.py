import logging
import re
import time
import uuid
from typing import Any, Awaitable, Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse


logger = logging.getLogger("app.requests")
audit_logger = logging.getLogger("app.audit")
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,128}$")


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level),
        format="%(asctime)s level=%(levelname)s logger=%(name)s message=%(message)s",
    )


def request_id_from(request: Request) -> str:
    supplied = request.headers.get("x-request-id", "")
    if REQUEST_ID_PATTERN.fullmatch(supplied):
        return supplied
    return str(uuid.uuid4())


async def request_context_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    request_id = request_id_from(request)
    request.state.request_id = request_id
    started = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - started) * 1000)
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "request_completed request_id=%s method=%s path=%s status=%s duration_ms=%s",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "unknown")
    logger.exception("unhandled_request_error request_id=%s", request_id, exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred."},
        headers={"X-Request-ID": request_id},
    )


def audit_event(event: str, *, request: Request | None = None, **fields: Any) -> None:
    safe_fields = " ".join(
        f"{key}={_safe_value(value)}" for key, value in sorted(fields.items())
    )
    request_id = getattr(request.state, "request_id", None) if request else None
    audit_logger.info("event=%s request_id=%s %s", event, request_id or "none", safe_fields)


def _safe_value(value: Any) -> str:
    if isinstance(value, bool | int | float) or value is None:
        return str(value)
    normalized = str(value).replace("\n", " ").replace("\r", " ")
    return normalized[:200]
