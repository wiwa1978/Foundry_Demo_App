import math
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


class ConfigurationError(RuntimeError):
    pass


@dataclass(frozen=True)
class RuntimeSettings:
    model_call_concurrency: int
    log_level: str


def load_environment(path: Path | None = None) -> None:
    load_dotenv(dotenv_path=path)


def load_runtime_settings() -> RuntimeSettings:
    log_level = (env_text("LOG_LEVEL", "INFO") or "INFO").upper()
    if log_level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
        raise ConfigurationError("LOG_LEVEL must be DEBUG, INFO, WARNING, ERROR, or CRITICAL.")
    env_float("FOUNDRY_INPUT_TOKEN_COST_PER_1K", minimum=0)
    env_float("FOUNDRY_OUTPUT_TOKEN_COST_PER_1K", minimum=0)
    if env_text("FOUNDRY_EMBEDDING_DIMENSIONS") is not None:
        env_int("FOUNDRY_EMBEDDING_DIMENSIONS", 0, minimum=1)
    return RuntimeSettings(
        model_call_concurrency=env_int(
            "MODEL_CALL_CONCURRENCY",
            8,
            minimum=1,
            maximum=128,
        ),
        log_level=log_level,
    )


def env_text(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    if value is None:
        return default
    normalized = value.strip()
    return normalized or default


def persistence_backend() -> str:
    backend = (env_text("PERSISTENCE_BACKEND", "sqlite") or "sqlite").lower()
    if backend not in {"sqlite", "cosmos"}:
        raise RuntimeError("PERSISTENCE_BACKEND must be 'sqlite' or 'cosmos'.")
    return backend


def first_env(*names: str, default: str | None = None) -> str | None:
    for name in names:
        value = env_text(name)
        if value is not None:
            return value
    return default


def env_csv(name: str) -> list[str]:
    value = env_text(name, "") or ""
    return list(dict.fromkeys(item.strip() for item in value.split(",") if item.strip()))


def env_bool(name: str, default: bool = False) -> bool:
    value = env_text(name)
    if value is None:
        return default
    normalized = value.lower()
    if normalized in {"1", "true", "yes"}:
        return True
    if normalized in {"0", "false", "no"}:
        return False
    raise ConfigurationError(f"{name} must be true or false.")


def env_int(
    name: str,
    default: int,
    *,
    minimum: int | None = None,
    maximum: int | None = None,
) -> int:
    value = env_text(name)
    try:
        parsed = default if value is None else int(value)
    except ValueError as exc:
        raise ConfigurationError(f"{name} must be an integer.") from exc
    if minimum is not None and parsed < minimum:
        raise ConfigurationError(f"{name} must be at least {minimum}.")
    if maximum is not None and parsed > maximum:
        raise ConfigurationError(f"{name} must be at most {maximum}.")
    return parsed


def env_float(
    name: str,
    default: float = 0,
    *,
    minimum: float | None = None,
    maximum: float | None = None,
) -> float:
    value = env_text(name)
    try:
        parsed = default if value is None else float(value)
    except ValueError as exc:
        raise ConfigurationError(f"{name} must be a number.") from exc
    if not math.isfinite(parsed):
        raise ConfigurationError(f"{name} must be a finite number.")
    if minimum is not None and parsed < minimum:
        raise ConfigurationError(f"{name} must be at least {minimum}.")
    if maximum is not None and parsed > maximum:
        raise ConfigurationError(f"{name} must be at most {maximum}.")
    return parsed
