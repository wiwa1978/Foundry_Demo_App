from pprint import pprint

from app.application.foundry_admin_config import (
    create_management_client,
    load_admin_config,
)
from app.core.config import load_environment
from app.infrastructure.azure.foundry.management import DefaultFoundryManagementGateway


def to_dict(value):
    if hasattr(value, "as_dict"):
        return value.as_dict()
    if hasattr(value, "__dict__"):
        return {
            key: to_dict(item)
            for key, item in vars(value).items()
            if not key.startswith("_")
        }
    if isinstance(value, list):
        return [to_dict(item) for item in value]
    return value


def main() -> None:
    load_environment()
    config = load_admin_config()
    client = create_management_client(DefaultFoundryManagementGateway(), config)
    for name in (
        "Microsoft.DefaultV2",
        "FoundryChat-Strict",
        "NoGuardrails",
        "FoundryChat-Microsoft-DefaultV2",
    ):
        try:
            policy = client.rai_policies.get(
                resource_group_name=config.resource_group,
                account_name=config.account_name,
                rai_policy_name=name,
            )
        except Exception as exc:
            print(f"\n=== {name} ERROR {exc} ===")
            continue
        print(f"\n=== {name} ===")
        pprint(to_dict(policy), width=120)


if __name__ == "__main__":
    main()
