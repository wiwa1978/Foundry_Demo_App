from unittest.mock import patch

import pytest

from app.cosmos_store import (
    CosmosConversationRepository,
    CosmosModelSettingsRepository,
    CosmosUseCaseResourceSettingsRepository,
)
from app.persistence import get_repositories, persistence_backend, reset_repositories
from app.repository_contracts import (
    ConversationRepository,
    ModelSettingsRepository,
    UseCaseResourceSettingsRepository,
)
from app.sqlite_store import (
    SQLiteConversationRepository,
    SQLiteModelSettingsRepository,
    SQLiteUseCaseResourceSettingsRepository,
)


@pytest.fixture(autouse=True)
def clear_repository_cache():
    reset_repositories()
    yield
    reset_repositories()


def test_selects_sqlite_repositories_once(monkeypatch):
    monkeypatch.setenv("PERSISTENCE_BACKEND", "sqlite")

    repositories = get_repositories()
    monkeypatch.setenv("PERSISTENCE_BACKEND", "cosmos")

    assert get_repositories() is repositories
    assert isinstance(repositories.conversations, SQLiteConversationRepository)
    assert isinstance(repositories.model_settings, SQLiteModelSettingsRepository)
    assert isinstance(repositories.use_case_settings, SQLiteUseCaseResourceSettingsRepository)


def test_selects_cosmos_repositories(monkeypatch):
    monkeypatch.setenv("PERSISTENCE_BACKEND", "cosmos")

    repositories = get_repositories()

    assert isinstance(repositories.conversations, CosmosConversationRepository)
    assert isinstance(repositories.model_settings, CosmosModelSettingsRepository)
    assert isinstance(repositories.use_case_settings, CosmosUseCaseResourceSettingsRepository)


@pytest.mark.parametrize(
    ("conversation_repository", "model_settings_repository", "use_case_settings_repository"),
    [
        (SQLiteConversationRepository(), SQLiteModelSettingsRepository(), SQLiteUseCaseResourceSettingsRepository()),
        (CosmosConversationRepository(), CosmosModelSettingsRepository(), CosmosUseCaseResourceSettingsRepository()),
    ],
)
def test_adapters_implement_repository_contracts(
    conversation_repository,
    model_settings_repository,
    use_case_settings_repository,
):
    assert isinstance(conversation_repository, ConversationRepository)
    assert isinstance(model_settings_repository, ModelSettingsRepository)
    assert isinstance(use_case_settings_repository, UseCaseResourceSettingsRepository)


def test_reset_allows_backend_reselection(monkeypatch):
    monkeypatch.setenv("PERSISTENCE_BACKEND", "sqlite")
    sqlite_repositories = get_repositories()

    monkeypatch.setenv("PERSISTENCE_BACKEND", "cosmos")
    reset_repositories()

    assert get_repositories() is not sqlite_repositories
    assert isinstance(get_repositories().conversations, CosmosConversationRepository)


def test_invalid_backend_is_rejected():
    with patch.dict("os.environ", {"PERSISTENCE_BACKEND": "invalid"}):
        with pytest.raises(RuntimeError, match="PERSISTENCE_BACKEND"):
            persistence_backend()
