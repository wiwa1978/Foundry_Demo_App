import os
from dataclasses import asdict, dataclass
from typing import Any

from azure.identity import DefaultAzureCredential


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


@dataclass(frozen=True)
class DeploymentRequest:
    deployment_name: str
    model_name: str
    model_version: str
    model_format: str = "OpenAI"
    sku_name: str = "Standard"
    sku_capacity: int = 1
    version_upgrade_option: str = "OnceNewDefaultVersionAvailable"
    rai_policy_name: str | None = None
    wait_for_completion: bool = False


def load_admin_config() -> FoundryAdminConfig:
    return FoundryAdminConfig(
        subscription_id=os.getenv("FOUNDRY_SUBSCRIPTION_ID")
        or os.getenv("AZURE_SUBSCRIPTION_ID"),
        resource_group=os.getenv("FOUNDRY_RESOURCE_GROUP") or os.getenv("AZURE_RESOURCE_GROUP"),
        account_name=os.getenv("FOUNDRY_ACCOUNT_NAME")
        or os.getenv("AZURE_AI_ACCOUNT_NAME")
        or os.getenv("AZURE_OPENAI_RESOURCE_NAME"),
    )


def admin_config_to_dict(config: FoundryAdminConfig) -> dict[str, Any]:
    return {**asdict(config), "is_configured": config.is_configured, "missing": config.missing}


def create_foundry_deployment(request: DeploymentRequest) -> dict[str, Any]:
    config = load_admin_config()
    if not config.is_configured:
        raise RuntimeError(
            "Foundry deployment admin is not configured. Set "
            f"{', '.join(config.missing)} in .env."
        )

    try:
        from azure.mgmt.cognitiveservices import CognitiveServicesManagementClient
    except ImportError as exc:
        raise RuntimeError(
            "Missing azure-mgmt-cognitiveservices. Run pip install -r requirements.txt."
        ) from exc

    credential = DefaultAzureCredential()
    client = CognitiveServicesManagementClient(credential, config.subscription_id)
    deployment_resource = {
        "sku": {
            "name": request.sku_name,
            "capacity": request.sku_capacity,
        },
        "properties": {
            "model": {
                "format": request.model_format,
                "name": request.model_name,
                "version": request.model_version,
            },
            "versionUpgradeOption": request.version_upgrade_option,
        },
    }
    if request.rai_policy_name:
        deployment_resource["properties"]["raiPolicyName"] = request.rai_policy_name

    poller = client.deployments.begin_create_or_update(
        config.resource_group,
        config.account_name,
        request.deployment_name,
        deployment_resource,
    )
    deployment = poller.result() if request.wait_for_completion else poller
    return _deployment_to_dict(deployment, request.wait_for_completion)


def _deployment_to_dict(deployment: Any, completed: bool) -> dict[str, Any]:
    if not completed:
        return {
            "status": "accepted",
            "provisioning_state": "Accepted",
        }

    properties = getattr(deployment, "properties", None)
    return {
        "status": "completed",
        "id": getattr(deployment, "id", None),
        "name": getattr(deployment, "name", None),
        "provisioning_state": getattr(properties, "provisioning_state", None),
    }
