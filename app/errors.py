from dataclasses import dataclass

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException


@dataclass
class ApplicationError(Exception):
    detail: str
    status_code: int
    code: str

    def __post_init__(self) -> None:
        super().__init__(self.detail)


class InvalidRequestError(ApplicationError):
    def __init__(self, detail: str) -> None:
        super().__init__(detail=detail, status_code=400, code="invalid_request")


class NotFoundError(ApplicationError):
    def __init__(self, detail: str) -> None:
        super().__init__(detail=detail, status_code=404, code="not_found")


class ExternalServiceError(ApplicationError):
    def __init__(self, operation: str) -> None:
        super().__init__(
            detail=f"{operation} failed. Try again later.",
            status_code=502,
            code="external_service_error",
        )


async def application_error_handler(
    request: Request,
    exc: ApplicationError,
) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    headers = {"X-Request-ID": request_id} if request_id else None
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "code": exc.code},
        headers=headers,
    )


async def http_error_handler(request: Request, exc: HTTPException) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    headers = dict(exc.headers or {})
    if request_id:
        headers["X-Request-ID"] = request_id
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": jsonable_encoder(exc.detail),
            "code": _http_error_code(exc.status_code),
        },
        headers=headers,
    )


async def request_validation_error_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    headers = {"X-Request-ID": request_id} if request_id else None
    return JSONResponse(
        status_code=422,
        content={
            "detail": jsonable_encoder(exc.errors()),
            "code": "validation_error",
        },
        headers=headers,
    )


def _http_error_code(status_code: int) -> str:
    return {
        400: "invalid_request",
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        409: "conflict",
        413: "payload_too_large",
        422: "validation_error",
    }.get(status_code, "http_error")
