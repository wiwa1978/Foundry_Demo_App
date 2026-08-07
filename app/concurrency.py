import asyncio
import threading
from collections.abc import Callable
from typing import ParamSpec, TypeVar

from app.config import load_runtime_settings

P = ParamSpec("P")
T = TypeVar("T")

MODEL_CALL_CONCURRENCY = load_runtime_settings().model_call_concurrency
model_call_semaphore = threading.BoundedSemaphore(MODEL_CALL_CONCURRENCY)


def invoke_model_call(
    function: Callable[P, T],
    /,
    *args: P.args,
    **kwargs: P.kwargs,
) -> T:
    with model_call_semaphore:
        return function(*args, **kwargs)


async def run_model_call(
    function: Callable[P, T],
    /,
    *args: P.args,
    **kwargs: P.kwargs,
) -> T:
    return await asyncio.to_thread(invoke_model_call, function, *args, **kwargs)
