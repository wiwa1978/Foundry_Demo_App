from typing import Any, TypedDict

from app.application.foundry_admin_config import (
    create_management_client,
    load_admin_config,
    optional_text,
)
from app.application.ports.foundry_management import FoundryManagementGateway


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


SYSTEM_GUARDRAIL_POLICY_COPIES = {
    "Microsoft.Default": "FoundryChat-Microsoft-Default",
    "Microsoft.DefaultV2": "FoundryChat-Microsoft-DefaultV2",
}


def list_guardrail_policies(
    gateway: FoundryManagementGateway,
) -> list[GuardrailPolicy]:
    config = load_admin_config()
    if not config.is_configured:
        raise RuntimeError(
            "Foundry guardrail discovery is not configured. Set "
            f"{', '.join(config.missing)} in the environment."
        )

    client = create_management_client(gateway, config)
    policies = client.rai_policies.list(
        resource_group_name=config.resource_group,
        account_name=config.account_name,
    )
    return sorted(
        (_guardrail_policy_to_dict(policy) for policy in policies),
        key=lambda policy: policy["name"].lower(),
    )


def create_system_guardrail_policy_copies(
    gateway: FoundryManagementGateway,
) -> list[GuardrailPolicy]:
    config = load_admin_config()
    if not config.is_configured:
        raise RuntimeError(
            "Foundry guardrail administration is not configured. Set "
            f"{', '.join(config.missing)} in the environment."
        )

    client = create_management_client(gateway, config)
    policies = list(
        client.rai_policies.list(
            resource_group_name=config.resource_group,
            account_name=config.account_name,
        )
    )
    policies_by_name = {
        str(getattr(policy, "name", "") or "").lower(): policy for policy in policies
    }
    for source_name, copy_name in SYSTEM_GUARDRAIL_POLICY_COPIES.items():
        existing = policies_by_name.get(copy_name.lower())
        if existing is not None:
            continue

        source = policies_by_name.get(source_name.lower())
        if source is None:
            raise RuntimeError(f"Foundry system guardrail {source_name} was not found.")
        created = client.rai_policies.create_or_update(
            resource_group_name=config.resource_group,
            account_name=config.account_name,
            rai_policy_name=copy_name,
            rai_policy=_guardrail_policy_copy_resource(source, source_name),
        )
        policies.append(created)
        policies_by_name[copy_name.lower()] = created
    return sorted(
        (_guardrail_policy_to_dict(policy) for policy in policies),
        key=lambda policy: policy["name"].lower(),
    )


def guardrail_policy_exists(
    gateway: FoundryManagementGateway,
    policy_name: str,
) -> bool:
    normalized_name = policy_name.strip().lower()
    return any(
        policy["name"].lower() == normalized_name and policy["is_selectable"]
        for policy in list_guardrail_policies(gateway)
    )


def _guardrail_policy_copy_resource(policy: Any, source_name: str) -> dict[str, Any]:
    properties = getattr(policy, "properties", None)
    content_filters: list[dict[str, Any]] = []
    for content_filter in getattr(properties, "content_filters", None) or []:
        copied_filter: dict[str, Any] = {
            "name": str(getattr(content_filter, "name", "") or ""),
            "source": str(getattr(content_filter, "source", "") or ""),
            "enabled": bool(getattr(content_filter, "enabled", False)),
            "blocking": bool(getattr(content_filter, "blocking", False)),
        }
        severity_threshold = getattr(content_filter, "severity_threshold", None)
        if severity_threshold is not None:
            copied_filter["severityThreshold"] = str(severity_threshold)
        content_filters.append(copied_filter)
    return {
        "tags": {
            "managedBy": "FoundryChatApp",
            "sourcePolicy": source_name,
        },
        "properties": {
            "basePolicyName": source_name,
            "mode": str(getattr(properties, "mode", "") or "Blocking"),
            "contentFilters": content_filters,
        },
    }


def _guardrail_policy_to_dict(policy: Any) -> GuardrailPolicy:
    properties = getattr(policy, "properties", None)
    policy_type = str(getattr(properties, "type", "") or "")
    name = str(getattr(policy, "name", "") or "")
    content_filters = getattr(properties, "content_filters", None) or []
    return {
        "id": optional_text(getattr(policy, "id", None)),
        "name": name,
        "type": policy_type,
        "mode": str(getattr(properties, "mode", "") or ""),
        "base_policy_name": optional_text(getattr(properties, "base_policy_name", None)),
        "content_filters": [
            {
                "name": str(getattr(content_filter, "name", "") or ""),
                "source": str(getattr(content_filter, "source", "") or ""),
                "enabled": bool(getattr(content_filter, "enabled", False)),
                "blocking": bool(getattr(content_filter, "blocking", False)),
                "severity_threshold": optional_text(
                    getattr(content_filter, "severity_threshold", None)
                ),
            }
            for content_filter in content_filters
        ],
        "is_selectable": bool(name)
        and "systemmanaged" not in policy_type.replace("_", "").lower()
        and not name.lower().startswith("microsoft."),
    }
