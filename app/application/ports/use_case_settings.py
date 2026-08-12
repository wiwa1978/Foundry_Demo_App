from typing import Protocol, runtime_checkable

from app.domain.models import UseCaseBinding


@runtime_checkable
class UseCaseResourceSettingsRepository(Protocol):
    def get_binding(self, use_case: str) -> UseCaseBinding | None: ...
    def save_binding(self, binding: UseCaseBinding) -> None: ...
