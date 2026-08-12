from typing import Any, Protocol


class FoundryManagementGateway(Protocol):
    def create_client(self, subscription_id: str) -> Any: ...
