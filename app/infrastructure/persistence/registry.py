from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache

from app.application.ports.conversations import ConversationRepository
from app.application.ports.model_settings import ModelSettingsRepository
from app.application.ports.use_case_settings import UseCaseResourceSettingsRepository
from app.core.config import persistence_backend


@dataclass(frozen=True)
class Repositories:
    conversations: ConversationRepository
    model_settings: ModelSettingsRepository
    use_case_settings: UseCaseResourceSettingsRepository
    initialize: Callable[[], None]
    check_health: Callable[[], None]


@lru_cache(maxsize=1)
def get_repositories() -> Repositories:
    if persistence_backend() == "cosmos":
        from app.infrastructure.persistence.cosmos import (
            CosmosConversationRepository,
            CosmosModelSettingsRepository,
            CosmosUseCaseResourceSettingsRepository,
            check_cosmos_store,
            initialize_cosmos_store,
        )

        return Repositories(
            conversations=CosmosConversationRepository(),
            model_settings=CosmosModelSettingsRepository(),
            use_case_settings=CosmosUseCaseResourceSettingsRepository(),
            initialize=initialize_cosmos_store,
            check_health=check_cosmos_store,
        )

    from app.infrastructure.persistence.sqlite import (
        SQLiteConversationRepository,
        SQLiteModelSettingsRepository,
        SQLiteUseCaseResourceSettingsRepository,
        check_sqlite_store,
        initialize_sqlite_store,
    )

    return Repositories(
        conversations=SQLiteConversationRepository(),
        model_settings=SQLiteModelSettingsRepository(),
        use_case_settings=SQLiteUseCaseResourceSettingsRepository(),
        initialize=initialize_sqlite_store,
        check_health=check_sqlite_store,
    )


def initialize_persistence() -> None:
    get_repositories().initialize()


def check_persistence() -> None:
    get_repositories().check_health()


def reset_repositories() -> None:
    get_repositories.cache_clear()
