from azure.core.exceptions import HttpResponseError

from app.application.foundry_admin_config import (
    create_management_client,
    load_admin_config,
)
from app.application.foundry_guardrails import STRICT_GUARDRAIL_POLICY_NAME
from app.core.config import load_environment
from app.infrastructure.azure.foundry.management import DefaultFoundryManagementGateway

SUFFIXES = [
    "Person",
    "PersonType",
    "PhoneNumber",
    "Organization",
    "Address",
    "Email",
    "URL",
    "Age",
    "DateTime",
    "ABARoutingNumber",
    "SWIFTCode",
    "NZSocialWelfareNumber",
    "AUBankAccountNumber",
    "AUDriversLicenseNumber",
    "AUMedicalAccountNumber",
    "AUTaxFileNumber",
    "CABankAccountNumber",
    "CADriversLicenseNumber",
    "CAHealthServiceNumber",
    "CAPassportNumber",
    "CAPersonalHealthIdentification",
    "CASocialInsuranceNumber",
    "EUDriversLicenseNumber",
    "EUGPSCoordinates",
    "EUNationalIdentificationNumber",
    "EUPassportNumber",
    "EUSocialSecurityNumber",
    "EUTaxIdentificationNumber",
    "INPermanentAccount",
    "INUniqueIdentificationNumber",
    "INVoterIdentificationNumber",
    "JPBankAccountNumber",
    "JPDriversLicenseNumber",
    "JPMyNumber",
    "JPPassportNumber",
    "JPResidenceCardNumber",
    "JPSocialInsuranceNumber",
    "JPResidentRegistrationNumber",
    "KRDriversLicenseNumber",
    "KRPassportNumber",
    "KRResidentRegistrationNumber",
    "KRSocialSecurityNumber",
    "UKDriversLicenseNumber",
    "UKElectoralRollNumber",
    "UKNationalHealthNumber",
    "UKNationalInsuranceNumber",
    "UKUniqueTaxpayerReferenceNumber",
    "USBankAccountNumber",
    "USDriversLicenseNumber",
    "USIndividualTaxpayerIdentification",
    "USSocialSecurityNumber",
    "USUkPassportNumber",
    "USUKPassportNumber",
    "CreditCardNumber",
    "InternationalBankingAccountNumber",
    "IPAddress",
    "LicensePlate",
    "PassportNumber",
    "SortCode",
    "SwiftCode",
    "DriversLicense",
    "SSN",
    "BankAccountNumber",
    "CreditCard",
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
    accepted: list[str] = []
    for suffix in SUFFIXES:
        name = f"PII_{suffix}"
        payload = {
            "tags": dict(current.tags or {}),
            "properties": {
                "basePolicyName": current.properties.base_policy_name,
                "mode": str(current.properties.mode),
                "contentFilters": [
                    *base_filters,
                    {
                        "name": name,
                        "source": "Prompt",
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
            print(f"OK {name}")
            accepted.append(name)
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
        except HttpResponseError:
            print(f"NO {name}")
    print("ACCEPTED", ",".join(accepted))


if __name__ == "__main__":
    main()
