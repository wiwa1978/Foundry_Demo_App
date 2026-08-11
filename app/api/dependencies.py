from fastapi import HTTPException, Request

from app.api.security import AuthorizationError, require_privileged_user, user_scope
from app.domain.identity import UserScope

AUTHENTICATION_REQUIRED_DETAIL = "Authentication is required."


def current_user_scope(request: Request) -> UserScope:
    """Resolve the caller's tenant/user scope, or fail with 401."""
    try:
        return user_scope(request)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=AUTHENTICATION_REQUIRED_DETAIL) from exc


def privileged_user_scope(request: Request) -> UserScope:
    """Resolve the caller's scope and assert administrator privileges.

    Used by endpoints that mutate global state or provision billable Azure resources.
    """
    try:
        return require_privileged_user(request)
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=AUTHENTICATION_REQUIRED_DETAIL) from exc
