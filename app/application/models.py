from dataclasses import asdict, replace
from typing import Any

from app.core.errors import InvalidRequestError
from app.infrastructure.persistence.models import (
    API_SURFACES as API_SURFACES,
)
from app.infrastructure.persistence.models import (
    DEPLOYMENT_DEFAULT_GUARDRAIL as DEPLOYMENT_DEFAULT_GUARDRAIL,
)
from app.infrastructure.persistence.models import (
    MODEL_MODALITIES as MODEL_MODALITIES,
)
from app.infrastructure.persistence.models import (
    ModelSettings,
    normalize_api_surface,
    normalize_guardrail_policy_names,
    normalize_modalities,
    settings_from_record,
)
from app.infrastructure.persistence.registry import get_repositories


def list_models(seed_models: list[str] | tuple[str, ...] | None = None) -> list[str]:
    seed_model_names = _normalize_model_list(seed_models or [])
    for model in seed_model_names:
        _insert_default_model_settings(model)
    return _merge_model_names(
        seed_model_names,
        get_repositories().model_settings.list_models(),
    )


def register_model(model: str) -> ModelSettings:
    normalized_model = _normalize_model(model)
    _insert_default_model_settings(normalized_model)
    return get_model_settings(normalized_model)


def get_model_settings(model: str) -> ModelSettings:
    normalized_model = _normalize_model(model)
    settings = get_repositories().model_settings.get_settings(normalized_model)
    if settings is None:
        return ModelSettings(
            model=normalized_model,
            api_surface=_default_api_surface(normalized_model),
            modalities=_default_modalities(normalized_model),
        )
    if "flux" in normalized_model.lower() and settings.modalities == ("text",):
        return replace(settings, modalities=("image",))
    return settings


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
        guardrail_policy_names=_normalize_guardrail_policy_names(
            settings.guardrail_policy_names
        ),
    )
    get_repositories().model_settings.save_settings(normalized)
    return normalized


def settings_to_dict(settings: ModelSettings) -> dict[str, Any]:
    return asdict(settings)


def _insert_default_model_settings(model: str) -> None:
    settings = ModelSettings(
        model=model,
        api_surface=_default_api_surface(model),
        modalities=_default_modalities(model),
    )
    get_repositories().model_settings.add_settings_if_absent(settings)


def _document_to_settings(document: dict[str, Any]) -> ModelSettings:
    return settings_from_record(document)



def _normalize_model(model: str) -> str:
    normalized_model = model.strip()
    if not normalized_model:
        raise InvalidRequestError("Model deployment name cannot be blank.")
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
    return normalize_api_surface(api_surface)


def _normalize_guardrail_policy_names(policy_names: tuple[str, ...] | list[str]) -> tuple[str, ...]:
    return normalize_guardrail_policy_names(policy_names)



def _normalize_modalities(modalities: tuple[str, ...] | list[str]) -> tuple[str, ...]:
    return normalize_modalities(modalities)


def _default_api_surface(model: str) -> str:
    return "chat_completions" if "kimi" in model.strip().lower() else "responses"


def _default_modalities(model: str) -> tuple[str, ...]:
    normalized_model = model.strip().lower()
    if any(
        token in normalized_model
        for token in ("dall-e", "gpt-image", "imagen", "mai-image", "vision", "flux")
    ):
        return ("image",)
    if any(
        token in normalized_model
        for token in ("audio", "realtime", "speech", "transcribe", "tts", "whisper", "voice")
    ):
        return ("voice",)
    return ("text",)
