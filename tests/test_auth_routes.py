from unittest.mock import patch

from fastapi.testclient import TestClient

from app.api.local_auth import AUTH_FLOW_COOKIE, AUTH_SESSION_COOKIE, decode_cookie
from app.main import create_app


def test_local_auth_callback_sets_session_cookie_and_clears_flow_cookie(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    monkeypatch.setenv("ENTRA_LOCAL_SESSION_SECRET", "a-local-test-secret-with-32-characters")
    claims = {
        "name": "Ada Lovelace",
        "oid": "user-1",
        "preferred_username": "ada@example.com",
        "tid": "tenant-1",
    }
    with patch("app.api.features.auth.router.decode_cookie", return_value={"state": "state-1"}):
        with patch("app.api.features.auth.router.complete_auth_flow", return_value=claims):
            client = TestClient(create_app())
            client.cookies.set(AUTH_FLOW_COOKIE, "flow-cookie")
            response = client.get(
                "/api/auth/callback?code=code-1",
                follow_redirects=False,
            )

    session = decode_cookie(response.cookies[AUTH_SESSION_COOKIE])
    assert response.status_code == 307
    assert response.headers["location"] == "/"
    assert session is not None
    assert session["user_id"] == "user-1"
    assert f"{AUTH_FLOW_COOKIE}=\"\"" in response.headers.get_list("set-cookie")[-2]
