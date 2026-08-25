from app.application.foundry_guardrails import list_guardrail_policies
from app.core.config import load_environment
from app.infrastructure.azure.foundry.management import DefaultFoundryManagementGateway


def main() -> None:
    load_environment()
    policies = list_guardrail_policies(DefaultFoundryManagementGateway())
    for policy in policies:
        print(f"\n=== {policy['name']} ({policy['type']}) ===")
        for item in policy["content_filters"]:
            print(
                f"{item['name']}|{item['source']}|enabled={item['enabled']}|"
                f"blocking={item['blocking']}|threshold={item['severity_threshold']}"
            )


if __name__ == "__main__":
    main()
