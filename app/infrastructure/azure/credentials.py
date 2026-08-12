from functools import lru_cache

from azure.identity import AzureCliCredential, ClientSecretCredential, DefaultAzureCredential

from app.core.config import env_text, persistence_backend


@lru_cache(maxsize=1)
def get_azure_credential():
    credential_type = (env_text("AZURE_CREDENTIAL_TYPE", "") or "").lower()
    if credential_type == "client_secret":
        tenant_id = env_text("AZURE_TENANT_ID")
        client_id = env_text("AZURE_CLIENT_ID")
        client_secret = env_text("AZURE_CLIENT_SECRET")
        if not tenant_id or not client_id or not client_secret:
            raise RuntimeError(
                "AZURE_CREDENTIAL_TYPE=client_secret requires AZURE_TENANT_ID, "
                "AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET."
            )
        return ClientSecretCredential(tenant_id, client_id, client_secret)
    if credential_type == "cli" or (not credential_type and persistence_backend() == "sqlite"):
        return AzureCliCredential(process_timeout=60)
    if credential_type not in {"", "default"}:
        raise RuntimeError("AZURE_CREDENTIAL_TYPE must be 'cli', 'client_secret', or 'default'.")
    return DefaultAzureCredential()
