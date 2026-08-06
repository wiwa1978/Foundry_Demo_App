import math

import pytest

from app.config import (
    ConfigurationError,
    env_bool,
    env_csv,
    env_float,
    env_int,
    env_text,
    first_env,
    load_runtime_settings,
)


def test_text_aliases_and_csv_are_normalized(monkeypatch):
    monkeypatch.setenv("PRIMARY", "  ")
    monkeypatch.setenv("SECONDARY", " value ")
    monkeypatch.setenv("CSV", " one, two, one, ,three ")

    assert env_text("SECONDARY") == "value"
    assert first_env("PRIMARY", "SECONDARY") == "value"
    assert env_csv("CSV") == ["one", "two", "three"]


@pytest.mark.parametrize(("value", "expected"), [("yes", True), ("0", False)])
def test_boolean_values_are_strict(monkeypatch, value, expected):
    monkeypatch.setenv("FLAG", value)
    assert env_bool("FLAG") is expected


def test_invalid_boolean_is_rejected(monkeypatch):
    monkeypatch.setenv("FLAG", "sometimes")
    with pytest.raises(ConfigurationError, match="FLAG must be true or false"):
        env_bool("FLAG")


def test_numeric_bounds_and_finite_values(monkeypatch):
    monkeypatch.setenv("COUNT", "0")
    with pytest.raises(ConfigurationError, match="at least 1"):
        env_int("COUNT", 8, minimum=1)

    monkeypatch.setenv("PRICE", str(math.inf))
    with pytest.raises(ConfigurationError, match="finite number"):
        env_float("PRICE", minimum=0)


def test_runtime_settings_validate_platform_values(monkeypatch):
    monkeypatch.setenv("MODEL_CALL_CONCURRENCY", "4")
    monkeypatch.setenv("LOG_LEVEL", "warning")
    monkeypatch.setenv("FOUNDRY_EMBEDDING_DIMENSIONS", "1536")

    settings = load_runtime_settings()

    assert settings.model_call_concurrency == 4
    assert settings.log_level == "WARNING"


def test_negative_cost_is_rejected(monkeypatch):
    monkeypatch.setenv("FOUNDRY_INPUT_TOKEN_COST_PER_1K", "-1")
    with pytest.raises(ConfigurationError, match="at least 0"):
        load_runtime_settings()
