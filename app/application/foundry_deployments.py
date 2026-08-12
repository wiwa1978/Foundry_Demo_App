from dataclasses import dataclass
from typing import Any, Literal, TypedDict

from app.application.foundry_admin_config import (
    create_management_client,
    load_admin_config,
    optional_text,
)
from app.application.ports.foundry_management import FoundryManagementGateway
from app.core.errors import InvalidRequestError


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


class DeploymentSummary(TypedDict):
    name: str
    model_name: str | None
    model_version: str | None
    provisioning_state: str


class DeploymentGuardrailPolicy(TypedDict):
    deployment_name: str
    policy_name: str | None


class DeploymentResult(TypedDict, total=False):
    status: Literal["accepted", "completed"]
    provisioning_state: str | None
    id: str | None
    name: str | None


class _DeploymentSku(TypedDict):
    name: str
    capacity: int


class _DeploymentModel(TypedDict):
    format: str
    name: str
    version: str


class _DeploymentProperties(TypedDict, total=False):
    model: _DeploymentModel
    versionUpgradeOption: str
    raiPolicyName: str


class _DeploymentResource(TypedDict):
    sku: _DeploymentSku
    properties: _DeploymentProperties


def list_foundry_deployments(
    gateway: FoundryManagementGateway,
) -> list[DeploymentSummary]:
    config = load_admin_config()
    if not config.is_configured:
        raise RuntimeError(
            "Foundry deployment discovery is not configured. Set "
            f"{', '.join(config.missing)} in the environment."
        )

    deployments = create_management_client(gateway, config).deployments.list(
        resource_group_name=config.resource_group,
        account_name=config.account_name,
    )
    return sorted(
        (
            deployment
            for deployment in (_deployment_summary(item) for item in deployments)
            if deployment["name"]
            and deployment["provisioning_state"].lower() not in {"canceled", "failed"}
        ),
        key=lambda deployment: deployment["name"].lower(),
    )


def get_deployment_guardrail_policy(
    gateway: FoundryManagementGateway,
    deployment_name: str,
) -> DeploymentGuardrailPolicy:
    config = load_admin_config()
    if not config.is_configured:
        raise RuntimeError(
            "Foundry deployment discovery is not configured. Set "
            f"{', '.join(config.missing)} in the environment."
        )

    normalized_name = deployment_name.strip()
    if not normalized_name:
        raise InvalidRequestError("Model deployment name cannot be blank.")

    deployment = create_management_client(gateway, config).deployments.get(
        resource_group_name=config.resource_group,
        account_name=config.account_name,
        deployment_name=normalized_name,
    )
    properties = getattr(deployment, "properties", None)
    return {
        "deployment_name": str(getattr(deployment, "name", "") or normalized_name),
        "policy_name": getattr(properties, "rai_policy_name", None),
    }


def create_foundry_deployment(
    gateway: FoundryManagementGateway,
    request: DeploymentRequest,
) -> DeploymentResult:
    config = load_admin_config()
    if not config.is_configured:
        raise RuntimeError(
            f"Foundry deployment admin is not configured. Set {', '.join(config.missing)} in .env."
        )

    client = create_management_client(gateway, config)
    deployment_properties: _DeploymentProperties = {
        "model": {
            "format": request.model_format,
            "name": request.model_name,
            "version": request.model_version,
        },
        "versionUpgradeOption": request.version_upgrade_option,
    }
    deployment_resource: _DeploymentResource = {
        "sku": {
            "name": request.sku_name,
            "capacity": request.sku_capacity,
        },
        "properties": deployment_properties,
    }
    if request.rai_policy_name:
        deployment_properties["raiPolicyName"] = request.rai_policy_name

    poller = client.deployments.begin_create_or_update(
        config.resource_group,
        config.account_name,
        request.deployment_name,
        deployment_resource,
    )
    deployment = poller.result() if request.wait_for_completion else poller
    return _deployment_to_dict(deployment, request.wait_for_completion)


def _deployment_summary(deployment: Any) -> DeploymentSummary:
    properties = getattr(deployment, "properties", None)
    model = getattr(properties, "model", None)
    return {
        "name": str(getattr(deployment, "name", "") or ""),
        "model_name": optional_text(getattr(model, "name", None)),
        "model_version": optional_text(getattr(model, "version", None)),
        "provisioning_state": str(getattr(properties, "provisioning_state", "") or ""),
    }


def _deployment_to_dict(deployment: Any, completed: bool) -> DeploymentResult:
    if not completed:
        return {
            "status": "accepted",
            "provisioning_state": "Accepted",
        }

    properties = getattr(deployment, "properties", None)
    return {
        "status": "completed",
        "id": optional_text(getattr(deployment, "id", None)),
        "name": optional_text(getattr(deployment, "name", None)),
        "provisioning_state": optional_text(getattr(properties, "provisioning_state", None)),
    }
