from typing import Any

from app.infrastructure.azure.credentials import get_azure_credential


class DefaultFoundryManagementGateway:
    def create_client(self, subscription_id: str) -> Any:
        try:
            from azure.mgmt.cognitiveservices import CognitiveServicesManagementClient
        except ImportError as exc:
            raise RuntimeError(
                "Foundry management requires the Azure Cognitive Services management SDK."
            ) from exc
        return CognitiveServicesManagementClient(
            credential=get_azure_credential(),
            subscription_id=subscription_id,
        )
