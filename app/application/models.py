from dataclasses import asdict, dataclass, replace
from typing import Any

from app.application.ports.model_settings import ModelSettingsRepository
from app.core.errors import InvalidRequestError
from app.domain.models import (
    ModelSettings,
    normalize_api_surface,
    normalize_guardrail_policy_names,
    normalize_modalities,
)


@dataclass(frozen=True)
class ModelService:
    repository: ModelSettingsRepository

    def list(self, seed_models: list[str] | tuple[str, ...] | None = None) -> list[str]:
        return list_models(self.repository, seed_models)

    def register(self, model: str) -> ModelSettings:
        return register_model(self.repository, model)

    def get(self, model: str) -> ModelSettings:
        return get_model_settings(self.repository, model)

    def save(self, settings: ModelSettings) -> ModelSettings:
        return save_model_settings(self.repository, settings)


def list_models(
    repository: ModelSettingsRepository,
    seed_models: list[str] | tuple[str, ...] | None = None,
) -> list[str]:
    seed_model_names = _normalize_model_list(seed_models or [])
    for model in seed_model_names:
        _insert_default_model_settings(repository, model)
    return _merge_model_names(seed_model_names, repository.list_models())


def register_model(repository: ModelSettingsRepository, model: str) -> ModelSettings:
    normalized_model = _normalize_model(model)
    _insert_default_model_settings(repository, normalized_model)
    return get_model_settings(repository, normalized_model)


def get_model_settings(repository: ModelSettingsRepository, model: str) -> ModelSettings:
    normalized_model = _normalize_model(model)
    settings = repository.get_settings(normalized_model)
    if settings is None:
        settings = ModelSettings(
            model=normalized_model,
            api_surface=_default_api_surface(normalized_model),
            modalities=_default_modalities(normalized_model),
        )
    if len(settings.guardrail_policy_names) != 2:
        inherited_policies = _find_guardrail_policy_defaults(repository, normalized_model)
        if inherited_policies:
            settings = replace(settings, guardrail_policy_names=inherited_policies)
    inferred_modalities = _default_modalities(normalized_model)
    if inferred_modalities == ("image",) and settings.modalities == ("text",):
        settings = replace(settings, modalities=inferred_modalities)
        repository.save_settings(settings)
    if _requires_chat_completions(normalized_model) and settings.api_surface == "responses":
        settings = replace(settings, api_surface="chat_completions")
    if _requires_responses(normalized_model) and settings.api_surface == "chat_completions":
        settings = replace(settings, api_surface="responses")
    return settings


def _find_guardrail_policy_defaults(
    repository: ModelSettingsRepository,
    excluded_model: str,
) -> tuple[str, ...] | None:
    """Use the first complete policy pair as the shared default for new models."""
    for model in repository.list_models():
        if model.strip().lower() == excluded_model.lower():
            continue
        settings = repository.get_settings(model)
        if settings is not None and len(settings.guardrail_policy_names) == 2:
            return settings.guardrail_policy_names
    return None


def save_model_settings(
    repository: ModelSettingsRepository,
    settings: ModelSettings,
) -> ModelSettings:
    normalized = ModelSettings(
        model=_normalize_model(settings.model),
        api_surface=normalize_api_surface(settings.api_surface),
        modalities=normalize_modalities(settings.modalities),
        system_prompt=settings.system_prompt.strip(),
        temperature=settings.temperature,
        top_p=settings.top_p,
        max_tokens=settings.max_tokens,
        repetition_penalty=settings.repetition_penalty,
        guardrail_policy_names=normalize_guardrail_policy_names(settings.guardrail_policy_names),
    )
    repository.save_settings(normalized)
    return normalized


def settings_to_dict(settings: ModelSettings) -> dict[str, Any]:
    return asdict(settings)


def _insert_default_model_settings(
    repository: ModelSettingsRepository,
    model: str,
) -> None:
    repository.add_settings_if_absent(
        ModelSettings(
            model=model,
            api_surface=_default_api_surface(model),
            modalities=_default_modalities(model),
        )
    )


def _normalize_model(model: str) -> str:
    normalized_model = model.strip()
    if not normalized_model:
        raise InvalidRequestError("Model deployment name cannot be blank.")
    return normalized_model


def _normalize_model_list(models: list[str] | tuple[str, ...]) -> list[str]:
    return _merge_model_names([_normalize_model(model) for model in models if model.strip()], [])


def _merge_model_names(primary: list[str], secondary: list[str]) -> list[str]:
    merged_models: list[str] = []
    seen: set[str] = set()
    for model in [*primary, *secondary]:
        normalized = model.strip()
        key = normalized.lower()
        if normalized and key not in seen:
            seen.add(key)
            merged_models.append(normalized)
    return merged_models


def _normalize_api_surface(api_surface: str) -> str:
    return normalize_api_surface(api_surface)


def _normalize_guardrail_policy_names(
    policy_names: tuple[str, ...] | list[str],
) -> tuple[str, ...]:
    return normalize_guardrail_policy_names(policy_names)


def _normalize_modalities(modalities: tuple[str, ...] | list[str]) -> tuple[str, ...]:
    return normalize_modalities(modalities)


def _default_api_surface(model: str) -> str:
    return "chat_completions" if _requires_chat_completions(model) else "responses"


def _requires_chat_completions(model: str) -> bool:
    normalized_model = model.strip().lower().replace("_", "-")
    return (
        "kimi" in normalized_model
        or normalized_model.startswith(("mai-thinking", "mai-thinkin"))
    )


def _requires_responses(model: str) -> bool:
    return model.strip().lower().replace("_", "-") == "model-router"


def _is_image_model(model: str) -> bool:
    normalized_model = model.strip().lower()
    return any(
        token in normalized_model
        for token in ("dall-e", "gpt-image", "imagen", "mai-image", "vision", "flux")
    )


def _default_modalities(model: str) -> tuple[str, ...]:
    normalized_model = model.strip().lower()
    if _is_image_model(normalized_model):
        return ("image",)
    if any(marker in normalized_model for marker in ("audio", "realtime", "transcribe", "tts")):
        return ("voice",)
    return ("text",)


def with_guardrail_policies(
    settings: ModelSettings,
    policy_names: tuple[str, ...],
) -> ModelSettings:
    return replace(settings, guardrail_policy_names=policy_names)
