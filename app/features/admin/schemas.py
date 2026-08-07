from typing import Literal

from pydantic import BaseModel

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
