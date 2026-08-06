from dataclasses import dataclass

from fastapi import Request
from fastapi.responses import JSONResponse


@dataclass
class ApplicationError(Exception):
    detail: str
    status_code: int


class ExternalServiceError(ApplicationError):
    def __init__(self, operation: str) -> None:
        super().__init__(
            detail=f"{operation} failed. Try again later.",
            status_code=502,
        )


async def application_error_handler(
    request: Request,
    exc: ApplicationError,
) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    headers = {"X-Request-ID": request_id} if request_id else None
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=headers,
    )
