"""Authorization tests for privileged (global-mutation) endpoints.

These endpoints change settings shared by every user or provision billable Azure
resources, so they must not be reachable by an arbitrary authenticated caller.
"""

import base64
import json

import pytest
from fastapi.testclient import TestClient

from app.api.security import is_privileged_user
from app.main import app

client = TestClient(app)

PRIVILEGED_REQUESTS = (
    ("get", "/api/admin/deployments/config", None),
    ("post", "/api/admin/guardrails/selectable-copies", None),
    ("post", "/api/admin/deployments", {"deployment_name": "d1", "model_name": "m1"}),
    ("post", "/api/models", {"model": "gpt-4o-mini"}),
    ("put", "/api/model-settings", {"model": "gpt-4o-mini"}),
)


@pytest.fixture(autouse=True)
def isolate_auth_environment(monkeypatch):
    for name in (
        "APP_AUTH_MODE",
        "APP_AUTH_TENANT_ID",
        "ADMIN_PRINCIPALS",
        "ENTRA_LOCAL_CLIENT_ID",
        "ENTRA_LOCAL_CLIENT_SECRET",
        "ENTRA_LOCAL_TENANT_ID",
        "ENTRA_LOCAL_SESSION_SECRET",
        "ENTRA_LOCAL_REDIRECT_URI",
    ):
        monkeypatch.delenv(name, raising=False)


def _principal(user_id: str = "user-1", email: str = "user@example.com") -> str:
    payload = {
        "identityProvider": "aad",
        "userId": user_id,
        "userDetails": email,
        "claims": [
            {"typ": "preferred_username", "val": email},
            {"typ": "tid", "val": "tenant-1"},
        ],
    }
    return base64.b64encode(json.dumps(payload).encode()).decode()


def _call(method: str, path: str, body: dict | None, headers: dict[str, str]):
    if body is None:
        return client.request(method, path, headers=headers)
    return client.request(method, path, json=body, headers=headers)


@pytest.mark.parametrize(("method", "path", "body"), PRIVILEGED_REQUESTS)
def test_privileged_endpoints_reject_non_admin_authenticated_user(monkeypatch, method, path, body):
    monkeypatch.setenv("APP_AUTH_MODE", "container_apps")
    monkeypatch.setenv("APP_AUTH_TENANT_ID", "tenant-1")
    monkeypatch.setenv("ADMIN_PRINCIPALS", "admin@example.com")

    response = _call(method, path, body, {"x-ms-client-principal": _principal()})

    assert response.status_code == 403
    assert "ADMIN_PRINCIPALS" in response.json()["detail"]


@pytest.mark.parametrize(("method", "path", "body"), PRIVILEGED_REQUESTS)
def test_privileged_endpoints_reject_when_allowlist_is_empty(monkeypatch, method, path, body):
    """An unset allowlist must fail closed rather than granting everyone access."""
    monkeypatch.setenv("APP_AUTH_MODE", "container_apps")
    monkeypatch.setenv("APP_AUTH_TENANT_ID", "tenant-1")

    response = _call(method, path, body, {"x-ms-client-principal": _principal()})

    assert response.status_code == 403


@pytest.mark.parametrize(("method", "path", "body"), PRIVILEGED_REQUESTS)
def test_privileged_endpoints_reject_anonymous_callers(monkeypatch, method, path, body):
    monkeypatch.setenv("APP_AUTH_MODE", "container_apps")
    monkeypatch.setenv("APP_AUTH_TENANT_ID", "tenant-1")
    monkeypatch.setenv("ADMIN_PRINCIPALS", "admin@example.com")

    response = _call(method, path, body, {})

    assert response.status_code == 401


def test_admin_config_allows_listed_administrator(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "container_apps")
    monkeypatch.setenv("APP_AUTH_TENANT_ID", "tenant-1")
    monkeypatch.setenv("ADMIN_PRINCIPALS", "admin@example.com")

    response = client.get(
        "/api/admin/deployments/config",
        headers={"x-ms-client-principal": _principal(email="admin@example.com")},
    )

    assert response.status_code == 200


def test_admin_allowlist_matches_object_id_and_is_case_insensitive(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "container_apps")
    monkeypatch.setenv("APP_AUTH_TENANT_ID", "tenant-1")
    monkeypatch.setenv("ADMIN_PRINCIPALS", "USER-1")

    response = client.get(
        "/api/admin/deployments/config",
        headers={"x-ms-client-principal": _principal(user_id="user-1")},
    )

    assert response.status_code == 200


def test_disabled_mode_keeps_local_demo_open(monkeypatch):
    """Local demo mode has no identity provider, so privileged routes stay reachable."""
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")

    response = client.get("/api/admin/deployments/config")

    assert response.status_code == 200


def test_is_privileged_user_ignores_blank_identity_fields(monkeypatch):
    monkeypatch.setenv("ADMIN_PRINCIPALS", "admin@example.com")

    assert not is_privileged_user(None)
    assert not is_privileged_user({"user_id": "", "email": None, "name": "   "})
    assert is_privileged_user({"user_id": "x", "email": "Admin@Example.com"})


def test_is_privileged_user_never_matches_display_name(monkeypatch):
    monkeypatch.setenv("ADMIN_PRINCIPALS", "Mutable Admin")

    assert not is_privileged_user(
        {
            "user_id": "user-1",
            "email": "user@example.com",
            "name": "Mutable Admin",
        }
    )


def test_is_privileged_user_requires_email_shaped_value_for_email_match(monkeypatch):
    monkeypatch.setenv("ADMIN_PRINCIPALS", "alias")

    assert not is_privileged_user({"user_id": "user-1", "email": "alias"})


def test_is_privileged_user_denies_when_allowlist_unset(monkeypatch):
    monkeypatch.delenv("ADMIN_PRINCIPALS", raising=False)

    assert not is_privileged_user({"email": "admin@example.com"})
