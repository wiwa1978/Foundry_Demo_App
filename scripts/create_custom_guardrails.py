from app.application.foundry_guardrails import create_custom_comparison_guardrails
from app.core.config import load_environment
from app.infrastructure.azure.foundry.management import DefaultFoundryManagementGateway


def main() -> None:
    load_environment()
    policies = create_custom_comparison_guardrails(DefaultFoundryManagementGateway())
    for policy in policies:
        print(
            f"{policy['name']} selectable={policy['is_selectable']} "
            f"mode={policy['mode']} filters={len(policy['content_filters'])}"
        )


if __name__ == "__main__":
    main()
