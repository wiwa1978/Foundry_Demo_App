import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any

import msal


AUTH_FLOW_COOKIE = "foundry_auth_flow"
AUTH_SESSION_COOKIE = "foundry_auth_session"


def is_local_auth_configured() -> bool:
    return all(
        os.getenv(name, "").strip()
        for name in (
            "ENTRA_LOCAL_CLIENT_ID",
            "ENTRA_LOCAL_CLIENT_SECRET",
            "ENTRA_LOCAL_TENANT_ID",
            "ENTRA_LOCAL_SESSION_SECRET",
            "ENTRA_LOCAL_REDIRECT_URI",
        )
    )


def create_auth_flow() -> dict[str, Any]:
    return _client().initiate_auth_code_flow(
        scopes=[],
        redirect_uri=_required_env("ENTRA_LOCAL_REDIRECT_URI"),
    )


def complete_auth_flow(flow: dict[str, Any], query: dict[str, str]) -> dict[str, Any]:
    result = _client().acquire_token_by_auth_code_flow(flow, query)
    if "error" in result:
        raise ValueError(result.get("error_description") or result["error"])
    claims = result.get("id_token_claims")
    if not isinstance(claims, dict):
        raise ValueError("Microsoft Entra ID did not return identity claims.")
    return claims


def user_from_claims(claims: dict[str, Any]) -> dict[str, Any]:
    email = claims.get("preferred_username") or claims.get("email")
    return {
        "authenticated": True,
        "name": claims.get("name") or email,
        "user_id": claims.get("oid") or claims.get("sub"),
        "identity_provider": "aad",
        "email": email,
        "tenant_id": claims.get("tid"),
    }


def encode_cookie(payload: dict[str, Any], lifetime_seconds: int) -> str:
    envelope = {**payload, "exp": int(time.time()) + lifetime_seconds}
    encoded = _urlsafe_encode(json.dumps(envelope, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(_cookie_secret(), encoded.encode("ascii"), hashlib.sha256).digest()
    return f"{encoded}.{_urlsafe_encode(signature)}"


def decode_cookie(value: str | None) -> dict[str, Any] | None:
    if not value:
        return None
    try:
        encoded, supplied_signature = value.split(".", 1)
        expected_signature = hmac.new(
            _cookie_secret(), encoded.encode("ascii"), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(_urlsafe_encode(expected_signature), supplied_signature):
            return None
        payload = json.loads(_urlsafe_decode(encoded))
        if not isinstance(payload, dict) or int(payload.get("exp", 0)) < int(time.time()):
            return None
        return payload
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


def _client() -> msal.ConfidentialClientApplication:
    tenant_id = _required_env("ENTRA_LOCAL_TENANT_ID")
    return msal.ConfidentialClientApplication(
        _required_env("ENTRA_LOCAL_CLIENT_ID"),
        authority=f"https://login.microsoftonline.com/{tenant_id}",
        client_credential=_required_env("ENTRA_LOCAL_CLIENT_SECRET"),
    )


def _cookie_secret() -> bytes:
    value = _required_env("ENTRA_LOCAL_SESSION_SECRET")
    if len(value) < 32:
        raise ValueError("ENTRA_LOCAL_SESSION_SECRET must contain at least 32 characters.")
    return value.encode("utf-8")


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"{name} is required for local authentication.")
    return value


def _urlsafe_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _urlsafe_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
