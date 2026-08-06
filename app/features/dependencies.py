from fastapi import HTTPException, Request

from app.security import UserScope, user_scope


def current_user_scope(request: Request) -> UserScope:
    try:
        return user_scope(request)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Authentication is required.") from exc
