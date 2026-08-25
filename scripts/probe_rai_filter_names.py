from azure.core.exceptions import HttpResponseError

from app.application.foundry_admin_config import (
    create_management_client,
    load_admin_config,
)
from app.application.foundry_guardrails import STRICT_GUARDRAIL_POLICY_NAME
from app.core.config import load_environment
from app.infrastructure.azure.foundry.management import DefaultFoundryManagementGateway

CANDIDATES = [
    ("PII", "Prompt"),
    ("PII", "Completion"),
    ("PersonallyIdentifiableInformation", "Prompt"),
    ("Personally Identifiable Information", "Prompt"),
    ("Personally Identifiable Information", "Completion"),
    ("Sensitive Data Leakage", "Prompt"),
    ("Sensitive Data", "Prompt"),
    ("DataLeakage", "Prompt"),
    ("PHI", "Prompt"),
    ("Task Adherence", "Prompt"),
    ("Task Adherence", "Completion"),
    ("TaskAdherence", "Prompt"),
    ("TaskAdherence", "Completion"),
    ("Task Drift", "Prompt"),
    ("Groundedness", "Completion"),
]


def main() -> None:
    load_environment()
    config = load_admin_config()
    client = create_management_client(DefaultFoundryManagementGateway(), config)
    current = client.rai_policies.get(
        resource_group_name=config.resource_group,
        account_name=config.account_name,
        rai_policy_name=STRICT_GUARDRAIL_POLICY_NAME,
    )
    base_filters = [
        {
            "name": item.name,
            "source": str(item.source),
            "enabled": item.enabled,
            "blocking": item.blocking,
            **(
                {"severityThreshold": item.severity_threshold}
                if item.severity_threshold
                else {}
            ),
        }
        for item in current.properties.content_filters
    ]
    for name, source in CANDIDATES:
        payload = {
            "tags": dict(current.tags or {}),
            "properties": {
                "basePolicyName": current.properties.base_policy_name,
                "mode": str(current.properties.mode),
                "contentFilters": [
                    *base_filters,
                    {
                        "name": name,
                        "source": source,
                        "enabled": True,
                        "blocking": True,
                    },
                ],
            },
        }
        try:
            client.rai_policies.create_or_update(
                resource_group_name=config.resource_group,
                account_name=config.account_name,
                rai_policy_name=STRICT_GUARDRAIL_POLICY_NAME,
                rai_policy=payload,
            )
            print(f"OK {name}|{source}")
            # restore original after a successful probe so later probes stay clean
            client.rai_policies.create_or_update(
                resource_group_name=config.resource_group,
                account_name=config.account_name,
                rai_policy_name=STRICT_GUARDRAIL_POLICY_NAME,
                rai_policy={
                    "tags": dict(current.tags or {}),
                    "properties": {
                        "basePolicyName": current.properties.base_policy_name,
                        "mode": str(current.properties.mode),
                        "contentFilters": base_filters,
                    },
                },
            )
        except HttpResponseError as exc:
            print(f"NO {name}|{source} :: {exc.message}")


if __name__ == "__main__":
    main()
