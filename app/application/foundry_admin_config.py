from dataclasses import dataclass
from typing import Any, TypedDict

from app.application.ports.foundry_management import FoundryManagementGateway
from app.core.config import first_env


@dataclass(frozen=True)
class FoundryAdminConfig:
    subscription_id: str | None
    resource_group: str | None
    account_name: str | None

    @property
    def is_configured(self) -> bool:
        return not self.missing

    @property
    def missing(self) -> list[str]:
        missing_values: list[str] = []
        if not self.subscription_id:
            missing_values.append("FOUNDRY_SUBSCRIPTION_ID")
        if not self.resource_group:
            missing_values.append("FOUNDRY_RESOURCE_GROUP")
        if not self.account_name:
            missing_values.append("FOUNDRY_ACCOUNT_NAME")
        return missing_values


class AdminConfigDocument(TypedDict):
    subscription_id: str | None
    resource_group: str | None
    account_name: str | None
    is_configured: bool
    missing: list[str]


def load_admin_config() -> FoundryAdminConfig:
    return FoundryAdminConfig(
        subscription_id=first_env("FOUNDRY_SUBSCRIPTION_ID", "AZURE_SUBSCRIPTION_ID"),
        resource_group=first_env("FOUNDRY_RESOURCE_GROUP", "AZURE_RESOURCE_GROUP"),
        account_name=first_env(
            "FOUNDRY_ACCOUNT_NAME",
            "AZURE_AI_ACCOUNT_NAME",
            "AZURE_OPENAI_RESOURCE_NAME",
        ),
    )


def admin_config_to_dict(config: FoundryAdminConfig) -> AdminConfigDocument:
    return {
        "subscription_id": config.subscription_id,
        "resource_group": config.resource_group,
        "account_name": config.account_name,
        "is_configured": config.is_configured,
        "missing": config.missing,
    }


def create_management_client(
    gateway: FoundryManagementGateway,
    config: FoundryAdminConfig,
) -> Any:
    if config.subscription_id is None:
        raise RuntimeError("Foundry subscription is not configured.")
    return gateway.create_client(config.subscription_id)


def optional_text(value: object) -> str | None:
    return str(value) if value is not None else None
