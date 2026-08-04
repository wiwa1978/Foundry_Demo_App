import hashlib
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any

from azure.cosmos.exceptions import CosmosResourceExistsError, CosmosResourceNotFoundError

from app.cosmos_store import get_container, initialize_cosmos_store

API_SURFACES = {"responses", "chat_completions"}
MODEL_MODALITIES = {"text", "image", "voice"}
MODEL_SETTINGS_PARTITION = "model-settings"
MODEL_SETTINGS_TYPE = "model_settings"


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
    initialize_cosmos_store()


def list_models(seed_models: list[str] | tuple[str, ...] | None = None) -> list[str]:
    seed_model_names = _normalize_model_list(seed_models or [])
    for model in seed_model_names:
        _insert_default_model_settings(model)
    rows = get_container().query_items(
        query=(
            "SELECT c.model FROM c WHERE c.document_type = @document_type "
            "ORDER BY c.model"
        ),
        parameters=[{"name": "@document_type", "value": MODEL_SETTINGS_TYPE}],
        partition_key=MODEL_SETTINGS_PARTITION,
    )
    return _merge_model_names(seed_model_names, [row["model"] for row in rows])


def register_model(model: str) -> ModelSettings:
    normalized_model = _normalize_model(model)
    _insert_default_model_settings(normalized_model)
    return get_model_settings(normalized_model)


def get_model_settings(model: str) -> ModelSettings:
    normalized_model = _normalize_model(model)
    try:
        document = get_container().read_item(
            item=_model_document_id(normalized_model),
            partition_key=MODEL_SETTINGS_PARTITION,
        )
    except CosmosResourceNotFoundError:
        return ModelSettings(
            model=normalized_model,
            api_surface=_default_api_surface(normalized_model),
            modalities=_default_modalities(normalized_model),
        )
    return _document_to_settings(document)


def save_model_settings(settings: ModelSettings) -> ModelSettings:
    normalized = ModelSettings(
        model=_normalize_model(settings.model),
        api_surface=_normalize_api_surface(settings.api_surface),
        modalities=_normalize_modalities(settings.modalities),
        system_prompt=settings.system_prompt,
        temperature=settings.temperature,
        top_p=settings.top_p,
        max_tokens=settings.max_tokens,
        repetition_penalty=settings.repetition_penalty,
    )
    get_container().upsert_item(_settings_document(normalized))
    return normalized


def settings_to_dict(settings: ModelSettings) -> dict[str, Any]:
    return asdict(settings)


def _insert_default_model_settings(model: str) -> None:
    settings = ModelSettings(
        model=model,
        api_surface=_default_api_surface(model),
        modalities=_default_modalities(model),
    )
    try:
        get_container().create_item(_settings_document(settings))
    except CosmosResourceExistsError:
        pass


def _settings_document(settings: ModelSettings) -> dict[str, Any]:
    return {
        "id": _model_document_id(settings.model),
        "partition_key": MODEL_SETTINGS_PARTITION,
        "document_type": MODEL_SETTINGS_TYPE,
        "model": settings.model,
        "api_surface": settings.api_surface,
        "modalities": list(settings.modalities),
        "system_prompt": settings.system_prompt,
        "temperature": settings.temperature,
        "top_p": settings.top_p,
        "max_tokens": settings.max_tokens,
        "repetition_penalty": settings.repetition_penalty,
        "updated_at": datetime.now(UTC).isoformat(),
    }


def _model_document_id(model: str) -> str:
    digest = hashlib.sha256(model.lower().encode("utf-8")).hexdigest()
    return f"model-{digest}"


def _document_to_settings(document: dict[str, Any]) -> ModelSettings:
    return ModelSettings(
        model=document["model"],
        api_surface=_normalize_api_surface(document.get("api_surface", "responses")),
        modalities=_normalize_modalities(document.get("modalities", ["text"])),
        system_prompt=document["system_prompt"],
        temperature=document["temperature"],
        top_p=document["top_p"],
        max_tokens=document["max_tokens"],
        repetition_penalty=document["repetition_penalty"],
    )


def _normalize_model(model: str) -> str:
    normalized_model = model.strip()
    if not normalized_model:
        raise ValueError("Model deployment name cannot be blank.")
    return normalized_model


def _normalize_model_list(models: list[str] | tuple[str, ...]) -> list[str]:
    return _merge_model_names([_normalize_model(model) for model in models if model.strip()], [])


def _merge_model_names(primary: list[str], secondary: list[str]) -> list[str]:
    merged_models: list[str] = []
    seen_models: set[str] = set()
    for model in [*primary, *secondary]:
        normalized_model = _normalize_model(model)
        model_key = normalized_model.lower()
        if model_key not in seen_models:
            seen_models.add(model_key)
            merged_models.append(normalized_model)
    return merged_models


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


def _default_api_surface(model: str) -> str:
    return "chat_completions" if "kimi" in model.strip().lower() else "responses"


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
