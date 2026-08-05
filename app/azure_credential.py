import os
from functools import lru_cache

from azure.identity import AzureCliCredential, DefaultAzureCredential

from app.persistence import persistence_backend


@lru_cache(maxsize=1)
def get_azure_credential():
    credential_type = os.getenv("AZURE_CREDENTIAL_TYPE", "").strip().lower()
    if credential_type == "cli" or (not credential_type and persistence_backend() == "sqlite"):
        return AzureCliCredential(process_timeout=60)
    if credential_type not in {"", "default"}:
        raise RuntimeError("AZURE_CREDENTIAL_TYPE must be 'cli' or 'default'.")
    return DefaultAzureCredential()
