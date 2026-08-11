from dataclasses import dataclass


@dataclass(frozen=True)
class UserScope:
    tenant_id: str
    user_id: str

    @property
    def owner_key(self) -> str:
        return f"{self.tenant_id}:{self.user_id}"
