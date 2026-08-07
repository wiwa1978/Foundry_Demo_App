from dataclasses import dataclass
from typing import Any, Literal, TypedDict

from app.azure_credential import get_azure_credential
from app.config import first_env
from app.errors import InvalidRequestError


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


class AdminConfigDocument(TypedDict):
    subscription_id: str | None
    resource_group: str | None
    account_name: str | None
    is_configured: bool
    missing: list[str]


class GuardrailContentFilter(TypedDict):
    name: str
    source: str
    enabled: bool
    blocking: bool
    severity_threshold: str | None


class GuardrailPolicy(TypedDict):
    id: str | None
    name: str
    type: str
    mode: str
    base_policy_name: str | None
    content_filters: list[GuardrailContentFilter]
    is_selectable: bool


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


def list_guardrail_policies() -> list[GuardrailPolicy]:
    config = load_admin_config()
    if not config.is_configured:
        raise RuntimeError(
            "Foundry guardrail discovery is not configured. Set "
            f"{', '.join(config.missing)} in the environment."
        )

    client = _create_management_client(config)
    policies = client.rai_policies.list(
        resource_group_name=config.resource_group,
        account_name=config.account_name,
    )
    return sorted(
        (_guardrail_policy_to_dict(policy) for policy in policies),
        key=lambda policy: policy["name"].lower(),
    )


def list_foundry_deployments() -> list[DeploymentSummary]:
    config = load_admin_config()
    if not config.is_configured:
        raise RuntimeError(
            "Foundry deployment discovery is not configured. Set "
            f"{', '.join(config.missing)} in the environment."
        )

    deployments = _create_management_client(config).deployments.list(
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


def guardrail_policy_exists(policy_name: str) -> bool:
    normalized_name = policy_name.strip().lower()
    return any(
        policy["name"].lower() == normalized_name and policy["is_selectable"]
        for policy in list_guardrail_policies()
    )


def get_deployment_guardrail_policy(deployment_name: str) -> DeploymentGuardrailPolicy:
    config = load_admin_config()
    if not config.is_configured:
        raise RuntimeError(
            "Foundry deployment discovery is not configured. Set "
            f"{', '.join(config.missing)} in the environment."
        )

    normalized_name = deployment_name.strip()
    if not normalized_name:
        raise InvalidRequestError("Model deployment name cannot be blank.")

    deployment = _create_management_client(config).deployments.get(
        resource_group_name=config.resource_group,
        account_name=config.account_name,
        deployment_name=normalized_name,
    )
    properties = getattr(deployment, "properties", None)
    return {
        "deployment_name": str(getattr(deployment, "name", "") or normalized_name),
        "policy_name": getattr(properties, "rai_policy_name", None),
    }


def create_foundry_deployment(request: DeploymentRequest) -> DeploymentResult:
    config = load_admin_config()
    if not config.is_configured:
        raise RuntimeError(
            "Foundry deployment admin is not configured. Set "
            f"{', '.join(config.missing)} in .env."
        )

    client = _create_management_client(config)
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


def _create_management_client(config: FoundryAdminConfig) -> Any:
    try:
        from azure.mgmt.cognitiveservices import CognitiveServicesManagementClient
    except ImportError as exc:
        raise RuntimeError(
            "Missing azure-mgmt-cognitiveservices. Run pip install -r requirements.txt."
        ) from exc

    return CognitiveServicesManagementClient(
        get_azure_credential(),
        config.subscription_id,
    )


def _guardrail_policy_to_dict(policy: Any) -> GuardrailPolicy:
    properties = getattr(policy, "properties", None)
    policy_type = str(getattr(properties, "type", "") or "")
    name = str(getattr(policy, "name", "") or "")
    content_filters = getattr(properties, "content_filters", None) or []
    return {
        "id": _optional_text(getattr(policy, "id", None)),
        "name": name,
        "type": policy_type,
        "mode": str(getattr(properties, "mode", "") or ""),
        "base_policy_name": _optional_text(getattr(properties, "base_policy_name", None)),
        "content_filters": [
            {
                "name": str(getattr(content_filter, "name", "") or ""),
                "source": str(getattr(content_filter, "source", "") or ""),
                "enabled": bool(getattr(content_filter, "enabled", False)),
                "blocking": bool(getattr(content_filter, "blocking", False)),
                "severity_threshold": _optional_text(
                    getattr(content_filter, "severity_threshold", None)
                ),
            }
            for content_filter in content_filters
        ],
        "is_selectable": bool(name)
        and "systemmanaged" not in policy_type.replace("_", "").lower()
        and not name.lower().startswith("microsoft."),
    }


def _deployment_summary(deployment: Any) -> DeploymentSummary:
    properties = getattr(deployment, "properties", None)
    model = getattr(properties, "model", None)
    return {
        "name": str(getattr(deployment, "name", "") or ""),
        "model_name": _optional_text(getattr(model, "name", None)),
        "model_version": _optional_text(getattr(model, "version", None)),
        "provisioning_state": str(
            getattr(properties, "provisioning_state", "") or ""
        ),
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
        "id": _optional_text(getattr(deployment, "id", None)),
        "name": _optional_text(getattr(deployment, "name", None)),
        "provisioning_state": _optional_text(getattr(properties, "provisioning_state", None)),
    }


def _optional_text(value: object) -> str | None:
    return str(value) if value is not None else None
