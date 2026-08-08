from typing import Literal

from pydantic import BaseModel, field_validator

from app.features.models.schemas import ModelSettingsResponse


class AdminDeploymentConfigResponse(BaseModel):
    subscription_id: str | None
    resource_group: str | None
    account_name: str | None
    is_configured: bool
    missing: list[str]


class DeploymentResponse(BaseModel):
    status: Literal["accepted", "completed"]
    provisioning_state: str | None = None
    id: str | None = None
    name: str | None = None


class AdminDeploymentResponse(BaseModel):
    deployment: DeploymentResponse
    settings: ModelSettingsResponse


class UseCaseResourceSettingsRequest(BaseModel):
    binding: str

    @field_validator("binding")
    @classmethod
    def require_value(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value cannot be blank.")
        return value


class UseCaseResourceSettingsResponse(BaseModel):
    use_case: str
    binding: str
    available_bindings: list[str]
