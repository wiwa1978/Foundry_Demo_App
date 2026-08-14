from unittest.mock import patch

import pytest

from app.infrastructure.azure.credentials import get_azure_credential
from app.infrastructure.azure.foundry.clients import mai_base_url


@pytest.fixture(autouse=True)
def clear_credential_cache():
    get_azure_credential.cache_clear()
    yield
    get_azure_credential.cache_clear()


@pytest.mark.parametrize(
    ("backend", "constructor"),
    [
        ("sqlite", "AzureCliCredential"),
        ("cosmos", "DefaultAzureCredential"),
    ],
)
def test_implicit_credential_follows_persistence_backend(monkeypatch, backend, constructor):
    monkeypatch.delenv("AZURE_CREDENTIAL_TYPE", raising=False)
    monkeypatch.setenv("PERSISTENCE_BACKEND", backend)

    with patch(f"app.infrastructure.azure.credentials.{constructor}") as credential:
        assert get_azure_credential() is credential.return_value


@pytest.mark.parametrize(
    ("credential_type", "constructor"),
    [("cli", "AzureCliCredential"), ("default", "DefaultAzureCredential")],
)
def test_explicit_credential_overrides_backend(
    monkeypatch,
    credential_type,
    constructor,
):
    monkeypatch.setenv("AZURE_CREDENTIAL_TYPE", credential_type)
    monkeypatch.setenv("PERSISTENCE_BACKEND", "cosmos" if credential_type == "cli" else "sqlite")

    with patch(f"app.infrastructure.azure.credentials.{constructor}") as credential:
        assert get_azure_credential() is credential.return_value


def test_client_secret_credential_is_unchanged(monkeypatch):
    monkeypatch.setenv("AZURE_CREDENTIAL_TYPE", "client_secret")
    monkeypatch.setenv("AZURE_TENANT_ID", "tenant")
    monkeypatch.setenv("AZURE_CLIENT_ID", "client")
    monkeypatch.setenv("AZURE_CLIENT_SECRET", "secret")

    with patch("app.infrastructure.azure.credentials.ClientSecretCredential") as credential:
        assert get_azure_credential() is credential.return_value
        credential.assert_called_once_with("tenant", "client", "secret")


def test_mai_base_url_uses_resource_endpoint_for_project_endpoint():
    assert (
        mai_base_url("https://example.services.ai.azure.com/api/projects/project-a")
        == "https://example.services.ai.azure.com/mai/v1"
    )