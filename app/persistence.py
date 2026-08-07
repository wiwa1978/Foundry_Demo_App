from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache

from app.config import env_text
from app.repository_contracts import ConversationRepository, ModelSettingsRepository


@dataclass(frozen=True)
class Repositories:
    conversations: ConversationRepository
    model_settings: ModelSettingsRepository
    initialize: Callable[[], None]
    check_health: Callable[[], None]


def persistence_backend() -> str:
    backend = (env_text("PERSISTENCE_BACKEND", "sqlite") or "sqlite").lower()
    if backend not in {"sqlite", "cosmos"}:
        raise RuntimeError("PERSISTENCE_BACKEND must be 'sqlite' or 'cosmos'.")
    return backend


@lru_cache(maxsize=1)
def get_repositories() -> Repositories:
    if persistence_backend() == "cosmos":
        from app.cosmos_store import (
            CosmosConversationRepository,
            CosmosModelSettingsRepository,
            check_cosmos_store,
            initialize_cosmos_store,
        )

        return Repositories(
            conversations=CosmosConversationRepository(),
            model_settings=CosmosModelSettingsRepository(),
            initialize=initialize_cosmos_store,
            check_health=check_cosmos_store,
        )

    from app.sqlite_store import (
        SQLiteConversationRepository,
        SQLiteModelSettingsRepository,
        check_sqlite_store,
        initialize_sqlite_store,
    )

    return Repositories(
        conversations=SQLiteConversationRepository(),
        model_settings=SQLiteModelSettingsRepository(),
        initialize=initialize_sqlite_store,
        check_health=check_sqlite_store,
    )


def initialize_persistence() -> None:
    get_repositories().initialize()


def check_persistence() -> None:
    get_repositories().check_health()


def reset_repositories() -> None:
    get_repositories.cache_clear()
