import base64
import json
import os
from dataclasses import dataclass
from enum import StrEnum
from typing import Any
from urllib.parse import urlparse

from starlette.requests import HTTPConnection

from app.local_auth import AUTH_SESSION_COOKIE, decode_cookie, is_local_auth_configured


class AuthMode(StrEnum):
    DISABLED = "disabled"
    LOCAL = "local"
    CONTAINER_APPS = "container_apps"


@dataclass(frozen=True)
class UserScope:
    tenant_id: str
    user_id: str

    @property
    def owner_key(self) -> str:
        return f"{self.tenant_id}:{self.user_id}"


LOCAL_DEMO_SCOPE = UserScope(tenant_id="local-demo", user_id="local-demo")


def auth_mode() -> AuthMode:
    configured = os.getenv("APP_AUTH_MODE", "").strip().lower()
    if configured:
        try:
            mode = AuthMode(configured)
        except ValueError as exc:
            raise RuntimeError(
                "APP_AUTH_MODE must be 'disabled', 'local', or 'container_apps'."
            ) from exc
    else:
        mode = AuthMode.LOCAL if is_local_auth_configured() else AuthMode.DISABLED
    if mode is AuthMode.LOCAL and not is_local_auth_configured():
        raise RuntimeError("APP_AUTH_MODE=local requires all ENTRA_LOCAL_* settings.")
    return mode


def authenticated_user(connection: HTTPConnection) -> dict[str, Any] | None:
    mode = auth_mode()
    if mode is AuthMode.DISABLED:
        return None
    if mode is AuthMode.LOCAL:
        local_user = decode_cookie(connection.cookies.get(AUTH_SESSION_COOKIE))
        if not local_user or not local_user.get("user_id") or not local_user.get("tenant_id"):
            return None
        return {key: value for key, value in local_user.items() if key != "exp"}

    principal = _decode_client_principal(connection.headers.get("x-ms-client-principal"))
    if principal is None:
        return _container_apps_header_user(connection)
    user_id = str(principal.get("userId") or "").strip()
    if not user_id:
        return None
    claims = principal.get("claims")
    claim_lookup = {
        str(claim.get("typ")): str(claim.get("val"))
        for claim in claims
        if isinstance(claim, dict) and claim.get("typ") and claim.get("val")
    } if isinstance(claims, list) else {}
    user_name = str(principal.get("userDetails") or "").strip() or None
    tenant_id = _claim_value(
        claim_lookup,
        "tid",
        "http://schemas.microsoft.com/identity/claims/tenantid",
    ) or os.getenv("APP_AUTH_TENANT_ID", "").strip()
    if not tenant_id:
        return None
    return {
        "authenticated": True,
        "name": user_name,
        "user_id": user_id,
        "identity_provider": principal.get("identityProvider"),
        "email": _claim_value(
            claim_lookup,
            "preferred_username",
            "email",
            "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
        )
        or user_name,
        "tenant_id": tenant_id,
    }


def _container_apps_header_user(connection: HTTPConnection) -> dict[str, Any] | None:
    user_id = str(connection.headers.get("x-ms-client-principal-id") or "").strip()
    tenant_id = os.getenv("APP_AUTH_TENANT_ID", "").strip()
    if not user_id or not tenant_id:
        return None
    user_name = str(connection.headers.get("x-ms-client-principal-name") or "").strip() or None
    return {
        "authenticated": True,
        "name": user_name,
        "user_id": user_id,
        "identity_provider": connection.headers.get("x-ms-client-principal-idp"),
        "email": user_name,
        "tenant_id": tenant_id,
    }


def user_scope(connection: HTTPConnection) -> UserScope:
    if auth_mode() is AuthMode.DISABLED:
        return LOCAL_DEMO_SCOPE
    user = authenticated_user(connection)
    if user is None:
        raise ValueError("Authenticated user is required.")
    tenant_id = str(user.get("tenant_id") or "").strip()
    user_id = str(user.get("user_id") or "").strip()
    if not tenant_id or not user_id:
        raise ValueError("Authenticated user identity is incomplete.")
    return UserScope(tenant_id=tenant_id, user_id=user_id)


def websocket_origin_allowed(connection: HTTPConnection) -> bool:
    origin = connection.headers.get("origin")
    if not origin:
        return False
    parsed = urlparse(origin)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return False
    configured_origins = {
        value.strip().rstrip("/")
        for value in os.getenv("ALLOWED_ORIGINS", "").split(",")
        if value.strip()
    }
    if configured_origins:
        return origin.rstrip("/") in configured_origins
    return parsed.netloc.lower() == connection.headers.get("host", "").lower()


def _decode_client_principal(value: str | None) -> dict[str, Any] | None:
    if not value:
        return None
    try:
        decoded = base64.b64decode(value, validate=True).decode("utf-8")
        principal = json.loads(decoded)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    return principal if isinstance(principal, dict) else None


def _claim_value(claims: dict[str, str], *names: str) -> str | None:
    for name in names:
        value = claims.get(name)
        if value:
            return value
    return None
