import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import asdict, dataclass
import json
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DATABASE_PATH = DATA_DIR / "foundry_chat.sqlite3"
API_SURFACES = {"responses", "chat_completions"}
MODEL_MODALITIES = {"text", "image", "voice"}


@dataclass(frozen=True)
class ModelSettings:
    model: str
    api_surface: str = "responses"
    modalities: tuple[str, ...] = ("text",)
    system_prompt: str = "You are a concise, helpful assistant."
    temperature: float = 0.7
    top_p: float = 1.0
    max_tokens: int = 1024
    repetition_penalty: float = 1.0


def initialize_database() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    with _connect() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS model_settings (
                model TEXT PRIMARY KEY,
                system_prompt TEXT NOT NULL,
                temperature REAL NOT NULL,
                top_p REAL NOT NULL,
                max_tokens INTEGER NOT NULL,
                repetition_penalty REAL NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(model_settings)").fetchall()
        }
        if "api_surface" not in columns:
            connection.execute(
                "ALTER TABLE model_settings ADD COLUMN api_surface TEXT NOT NULL DEFAULT 'responses'"
            )
        if "modalities_json" not in columns:
            connection.execute(
                "ALTER TABLE model_settings ADD COLUMN modalities_json TEXT NOT NULL DEFAULT '[\"text\"]'"
            )


def list_models(seed_models: list[str] | tuple[str, ...] | None = None) -> list[str]:
    seed_model_names = _normalize_model_list(seed_models or [])
    initialize_database()

    with _connect() as connection:
        for model in seed_model_names:
            _insert_default_model_settings(connection, model)
        rows = connection.execute(
            """
            SELECT model
            FROM model_settings
            ORDER BY lower(model), model
            """
        ).fetchall()

    return _merge_model_names(seed_model_names, [row["model"] for row in rows])


def register_model(model: str) -> ModelSettings:
    normalized_model = _normalize_model(model)
    initialize_database()

    with _connect() as connection:
        _insert_default_model_settings(connection, normalized_model)

    return get_model_settings(normalized_model)


def get_model_settings(model: str) -> ModelSettings:
    normalized_model = _normalize_model(model)
    initialize_database()

    with _connect() as connection:
        row = connection.execute(
            """
            SELECT model, api_surface, modalities_json, system_prompt, temperature, top_p, max_tokens, repetition_penalty
            FROM model_settings
            WHERE model = ?
            """,
            (normalized_model,),
        ).fetchone()

    if row is None:
        return ModelSettings(
            model=normalized_model,
            api_surface=_default_api_surface(normalized_model),
            modalities=_default_modalities(normalized_model),
        )

    return ModelSettings(
        model=row["model"],
        api_surface=_normalize_api_surface(row["api_surface"]),
        modalities=_normalize_modalities(_load_modalities(row["modalities_json"])),
        system_prompt=row["system_prompt"],
        temperature=row["temperature"],
        top_p=row["top_p"],
        max_tokens=row["max_tokens"],
        repetition_penalty=row["repetition_penalty"],
    )


def save_model_settings(settings: ModelSettings) -> ModelSettings:
    normalized_settings = ModelSettings(
        model=_normalize_model(settings.model),
        api_surface=_normalize_api_surface(settings.api_surface),
        modalities=_normalize_modalities(settings.modalities),
        system_prompt=settings.system_prompt,
        temperature=settings.temperature,
        top_p=settings.top_p,
        max_tokens=settings.max_tokens,
        repetition_penalty=settings.repetition_penalty,
    )
    initialize_database()

    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO model_settings (
                model,
                api_surface,
                modalities_json,
                system_prompt,
                temperature,
                top_p,
                max_tokens,
                repetition_penalty,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(model) DO UPDATE SET
                api_surface = excluded.api_surface,
                modalities_json = excluded.modalities_json,
                system_prompt = excluded.system_prompt,
                temperature = excluded.temperature,
                top_p = excluded.top_p,
                max_tokens = excluded.max_tokens,
                repetition_penalty = excluded.repetition_penalty,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                normalized_settings.model,
                normalized_settings.api_surface,
                json.dumps(list(normalized_settings.modalities)),
                normalized_settings.system_prompt,
                normalized_settings.temperature,
                normalized_settings.top_p,
                normalized_settings.max_tokens,
                normalized_settings.repetition_penalty,
            ),
        )

    return normalized_settings


def settings_to_dict(settings: ModelSettings) -> dict[str, Any]:
    return asdict(settings)


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def _normalize_model(model: str) -> str:
    normalized_model = model.strip()
    if not normalized_model:
        raise ValueError("Model deployment name cannot be blank.")
    return normalized_model


def _normalize_model_list(models: list[str] | tuple[str, ...]) -> list[str]:
    normalized_models: list[str] = []
    for model in models:
        if not model.strip():
            continue
        normalized_models.append(_normalize_model(model))
    return _merge_model_names(normalized_models, [])


def _merge_model_names(primary: list[str], secondary: list[str]) -> list[str]:
    merged_models: list[str] = []
    seen_models: set[str] = set()
    for model in [*primary, *secondary]:
        normalized_model = _normalize_model(model)
        model_key = normalized_model.lower()
        if model_key in seen_models:
            continue
        seen_models.add(model_key)
        merged_models.append(normalized_model)
    return merged_models


def _insert_default_model_settings(connection: sqlite3.Connection, model: str) -> None:
    default_settings = ModelSettings(
        model=model,
        api_surface=_default_api_surface(model),
        modalities=_default_modalities(model),
    )
    connection.execute(
        """
        INSERT INTO model_settings (
            model,
            api_surface,
            modalities_json,
            system_prompt,
            temperature,
            top_p,
            max_tokens,
            repetition_penalty,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(model) DO NOTHING
        """,
        (
            default_settings.model,
            default_settings.api_surface,
            json.dumps(list(default_settings.modalities)),
            default_settings.system_prompt,
            default_settings.temperature,
            default_settings.top_p,
            default_settings.max_tokens,
            default_settings.repetition_penalty,
        ),
    )


def _normalize_api_surface(api_surface: str) -> str:
    normalized_surface = api_surface.strip().lower()
    if normalized_surface not in API_SURFACES:
        raise ValueError("API surface must be 'responses' or 'chat_completions'.")
    return normalized_surface


def _normalize_modalities(modalities: tuple[str, ...] | list[str]) -> tuple[str, ...]:
    normalized_modalities = tuple(
        dict.fromkeys(modality.strip().lower() for modality in modalities if modality.strip())
    )
    if not normalized_modalities:
        raise ValueError("Select at least one model capability.")
    unsupported = sorted(set(normalized_modalities) - MODEL_MODALITIES)
    if unsupported:
        raise ValueError(
            "Model capabilities must be one or more of: "
            f"{', '.join(sorted(MODEL_MODALITIES))}."
        )
    return normalized_modalities


def _load_modalities(value: str | None) -> tuple[str, ...]:
    if not value:
        return ("text",)
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return ("text",)
    if not isinstance(parsed, list):
        return ("text",)
    return tuple(str(item) for item in parsed)


def _default_api_surface(model: str) -> str:
    normalized_model = model.strip().lower()
    if "kimi" in normalized_model:
        return "chat_completions"
    return "responses"


def _default_modalities(model: str) -> tuple[str, ...]:
    normalized_model = model.strip().lower()
    if any(token in normalized_model for token in ("dall-e", "gpt-image", "imagen", "vision")):
        return ("image",)
    if any(
        token in normalized_model
        for token in ("audio", "realtime", "speech", "tts", "whisper", "voice")
    ):
        return ("voice",)
    return ("text",)
