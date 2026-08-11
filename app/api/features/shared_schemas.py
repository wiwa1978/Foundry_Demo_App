from typing import Any

from pydantic import BaseModel

# Foundry SDK payloads vary by API surface and model version. Keep that variability
# confined to trace and provider-metadata fields rather than whole API responses.
type ProviderTrace = dict[str, Any]
type ProviderMetadata = dict[str, Any]


class DeletedResponse(BaseModel):
    deleted: bool
