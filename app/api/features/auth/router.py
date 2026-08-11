from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from app.api.features.auth.schemas import AuthResponse
from app.api.local_auth import (
    AUTH_FLOW_COOKIE,
    AUTH_SESSION_COOKIE,
    complete_auth_flow,
    create_auth_flow,
    decode_cookie,
    encode_cookie,
    is_local_auth_configured,
    user_from_claims,
)
from app.api.security import AuthMode, auth_mode, authenticated_user
from app.core.errors import InvalidRequestError
from app.core.observability import audit_event

router = APIRouter()


@router.get(
    "/api/auth/me",
    response_model=AuthResponse,
    response_model_exclude_unset=True,
)
def get_authenticated_user(request: Request) -> dict:
    user = authenticated_user(request)
    auth_enabled = auth_mode() is not AuthMode.DISABLED
    if user is None:
        return {"authenticated": False, "entra_auth_enabled": auth_enabled}
    return {**user, "entra_auth_enabled": auth_enabled}


@router.get("/api/auth/login")
def login(request: Request) -> RedirectResponse:
    if not is_local_auth_configured():
        return RedirectResponse("/.auth/login/aad?post_login_redirect_uri=/")
    flow = create_auth_flow()
    response = RedirectResponse(flow["auth_uri"])
    response.set_cookie(
        AUTH_FLOW_COOKIE,
        encode_cookie(flow, lifetime_seconds=600),
        max_age=600,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="lax",
    )
    return response


@router.get("/api/auth/callback")
def auth_callback(request: Request) -> RedirectResponse:
    flow = decode_cookie(request.cookies.get(AUTH_FLOW_COOKIE))
    if not flow:
        raise InvalidRequestError("The local sign-in session expired. Try again.")
    try:
        claims = complete_auth_flow(flow, dict(request.query_params))
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    response = RedirectResponse("/")
    response.delete_cookie(AUTH_FLOW_COOKIE)
    response.set_cookie(
        AUTH_SESSION_COOKIE,
        encode_cookie(user_from_claims(claims), lifetime_seconds=8 * 60 * 60),
        max_age=8 * 60 * 60,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="lax",
    )
    audit_event("authentication_completed", request=request)
    return response


@router.get("/api/auth/logout")
def logout(request: Request) -> RedirectResponse:
    audit_event("logout_requested", request=request)
    if not is_local_auth_configured():
        return RedirectResponse("/.auth/logout?post_logout_redirect_uri=/")
    response = RedirectResponse("/")
    response.delete_cookie(AUTH_SESSION_COOKIE)
    response.delete_cookie(AUTH_FLOW_COOKIE)
    return response
