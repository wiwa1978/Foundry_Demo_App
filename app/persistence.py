import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Callable

from app.repository_contracts import ConversationRepository, ModelSettingsRepository


@dataclass(frozen=True)
class Repositories:
    conversations: ConversationRepository
    model_settings: ModelSettingsRepository
    initialize: Callable[[], None]


def persistence_backend() -> str:
    backend = os.getenv("PERSISTENCE_BACKEND", "sqlite").strip().lower()
    if backend not in {"sqlite", "cosmos"}:
        raise RuntimeError("PERSISTENCE_BACKEND must be 'sqlite' or 'cosmos'.")
    return backend


@lru_cache(maxsize=1)
def get_repositories() -> Repositories:
    if persistence_backend() == "cosmos":
        from app.cosmos_store import (
            CosmosConversationRepository,
            CosmosModelSettingsRepository,
            initialize_cosmos_store,
        )

        return Repositories(
            conversations=CosmosConversationRepository(),
            model_settings=CosmosModelSettingsRepository(),
            initialize=initialize_cosmos_store,
        )

    from app.sqlite_store import (
        SQLiteConversationRepository,
        SQLiteModelSettingsRepository,
        initialize_sqlite_store,
    )

    return Repositories(
        conversations=SQLiteConversationRepository(),
        model_settings=SQLiteModelSettingsRepository(),
        initialize=initialize_sqlite_store,
    )


def initialize_persistence() -> None:
    get_repositories().initialize()


def reset_repositories() -> None:
    get_repositories.cache_clear()
