from pydantic import BaseModel


class AuthResponse(BaseModel):
    authenticated: bool
    entra_auth_enabled: bool
    name: str | None = None
    email: str | None = None
    user_id: str | None = None
    identity_provider: str | None = None
    tenant_id: str | None = None
