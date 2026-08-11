from collections.abc import Iterator
from typing import Any, Protocol

from app.infrastructure.azure.foundry.chat import (
    build_foundry_request_trace,
    complete_chat,
    stream_chat,
)


class FoundryChatGateway(Protocol):
    def build_request_trace(self, **kwargs: Any) -> dict[str, Any]: ...

    def complete(self, **kwargs: Any) -> dict[str, Any]: ...

    def stream(self, **kwargs: Any) -> Iterator[dict[str, Any]]: ...


class DefaultFoundryChatGateway:
    def build_request_trace(self, **kwargs: Any) -> dict[str, Any]:
        return build_foundry_request_trace(**kwargs)

    def complete(self, **kwargs: Any) -> dict[str, Any]:
        return complete_chat(**kwargs)

    def stream(self, **kwargs: Any) -> Iterator[dict[str, Any]]:
        yield from stream_chat(**kwargs)
