from app.local_auth import decode_cookie, encode_cookie, user_from_claims


def test_signed_session_cookie_round_trip(monkeypatch):
    monkeypatch.setenv("ENTRA_LOCAL_SESSION_SECRET", "a-local-test-secret-with-32-characters")

    cookie = encode_cookie({"authenticated": True, "user_id": "user-1"}, lifetime_seconds=60)

    assert decode_cookie(cookie)["user_id"] == "user-1"


def test_tampered_session_cookie_is_rejected(monkeypatch):
    monkeypatch.setenv("ENTRA_LOCAL_SESSION_SECRET", "a-local-test-secret-with-32-characters")
    cookie = encode_cookie({"authenticated": True}, lifetime_seconds=60)

    assert decode_cookie(f"{cookie}tampered") is None


def test_user_is_mapped_from_id_token_claims():
    user = user_from_claims(
        {
            "name": "Ada Lovelace",
            "oid": "user-1",
            "preferred_username": "ada@example.com",
            "tid": "tenant-1",
        }
    )

    assert user == {
        "authenticated": True,
        "name": "Ada Lovelace",
        "user_id": "user-1",
        "identity_provider": "aad",
        "email": "ada@example.com",
        "tenant_id": "tenant-1",
    }
