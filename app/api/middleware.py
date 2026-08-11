from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse

from app.api.security import AuthMode, auth_mode, authenticated_user

PUBLIC_API_PATHS = {
    "/api/auth/me",
    "/api/auth/login",
    "/api/auth/callback",
    "/api/auth/logout",
    "/api/config",
    "/api/health",
    "/api/ready",
}


async def require_authenticated_api_user(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    if (
        request.method != "OPTIONS"
        and request.url.path.startswith("/api/")
        and request.url.path not in PUBLIC_API_PATHS
        and auth_mode() is not AuthMode.DISABLED
        and authenticated_user(request) is None
    ):
        return JSONResponse(
            status_code=401,
            content={
                "detail": "Sign in with Microsoft Entra ID to use this app.",
                "code": "unauthorized",
            },
        )
    return await call_next(request)
