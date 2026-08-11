from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.api.features.models.schemas import ModelSettingsRequest, ModelSettingsResponse


class AdminDeploymentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    deployment_name: str = Field(min_length=1)
    model_name: str = Field(min_length=1)
    model_version: str = Field(min_length=1)
    model_format: str = "OpenAI"
    sku_name: str = "Standard"
    sku_capacity: Annotated[int, Field(ge=1)] = 1
    version_upgrade_option: str = "OnceNewDefaultVersionAvailable"
    rai_policy_name: str | None = None
    wait_for_completion: bool = False
    api_surface: str = "responses"
    modalities: list[str] = Field(default_factory=lambda: ["text"])

    @field_validator(
        "deployment_name",
        "model_name",
        "model_version",
        "model_format",
        "sku_name",
        "version_upgrade_option",
    )
    @classmethod
    def trim_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value cannot be blank.")
        return value

    @field_validator("rai_policy_name")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @field_validator("api_surface")
    @classmethod
    def normalize_api_surface(cls, value: str) -> str:
        return ModelSettingsRequest.normalize_api_surface(value)

    @field_validator("modalities")
    @classmethod
    def normalize_modalities(cls, value: list[str]) -> list[str]:
        return ModelSettingsRequest.normalize_modalities(value)


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
