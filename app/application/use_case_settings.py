import os
import re
from dataclasses import dataclass
from urllib.parse import urlparse

from app.application.ports.use_case_settings import UseCaseResourceSettingsRepository
from app.domain.models import UseCaseBinding

LIVE_TRANSLATION_USE_CASE = "live_translation"
MODEL_MAP_USE_CASE = "__use_case_model_map__"
BINDING_NAME_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]*$")
PROJECT_ENDPOINT_PREFIX = "FOUNDRY_PROJECT_ENDPOINT_"


@dataclass(frozen=True)
class FoundryBinding:
    name: str
    project_endpoint: str
    models: tuple[str, ...]
    speech_endpoint: str
    speech_key: str | None
    region: str | None


@dataclass(frozen=True)
class UseCaseSettingsService:
    repository: UseCaseResourceSettingsRepository

    def get(self, use_case: str) -> UseCaseBinding | None:
        return get_use_case_binding(self.repository, use_case)

    def resolve(self, use_case: str) -> FoundryBinding | None:
        return resolve_use_case_binding(self.repository, use_case)

    def save(self, use_case: str, binding: str) -> UseCaseBinding:
        return save_use_case_binding(self.repository, use_case, binding)

    def get_model_map(self) -> str | None:
        return get_use_case_model_map(self.repository)

    def save_model_map(self, payload: str) -> None:
        save_use_case_model_map(self.repository, payload)

def list_foundry_bindings() -> list[FoundryBinding]:
    names = sorted(
        name.removeprefix(PROJECT_ENDPOINT_PREFIX)
        for name, value in os.environ.items()
        if name.startswith(PROJECT_ENDPOINT_PREFIX)
        and name != "FOUNDRY_PROJECT_ENDPOINT"
        and value.strip()
    )
    return [resolve_foundry_binding(name) for name in names]


def resolve_foundry_binding(name: str) -> FoundryBinding:
    normalized_name = normalize_binding_name(name)
    project_endpoint = (
        os.getenv(f"{PROJECT_ENDPOINT_PREFIX}{normalized_name}", "").strip().rstrip("/")
    )
    if not project_endpoint:
        raise ValueError(f"Foundry binding {normalized_name} is not configured.")
    parsed = urlparse(project_endpoint)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError(
            f"FOUNDRY_PROJECT_ENDPOINT_{normalized_name} must be an absolute HTTPS endpoint."
        )

    models = tuple(
        model.strip()
        for model in os.getenv(f"FOUNDRY_MODELS_{normalized_name}", "").split(",")
        if model.strip()
    )
    speech_endpoint = os.getenv(f"AZURE_SPEECH_ENDPOINT_{normalized_name}", "").strip().rstrip("/")
    if not speech_endpoint:
        resource_name = parsed.netloc.split(".", 1)[0]
        speech_endpoint = f"https://{resource_name}.cognitiveservices.azure.com"
    speech_parsed = urlparse(speech_endpoint)
    if speech_parsed.scheme != "https" or not speech_parsed.netloc.lower().endswith(
        ".cognitiveservices.azure.com"
    ):
        raise ValueError(
            f"AZURE_SPEECH_ENDPOINT_{normalized_name} must be an Azure Speech custom-domain endpoint."
        )
    region = (
        os.getenv(normalized_name, "").strip().lower()
        or os.getenv(f"FOUNDRY_REGION_{normalized_name}", "").strip().lower()
        or None
    )
    return FoundryBinding(
        name=normalized_name,
        project_endpoint=project_endpoint,
        models=models,
        speech_endpoint=speech_endpoint,
        speech_key=os.getenv(f"AZURE_SPEECH_KEY_{normalized_name}", "").strip() or None,
        region=region,
    )


def normalize_binding_name(name: str) -> str:
    normalized_name = name.strip().upper()
    if not BINDING_NAME_PATTERN.fullmatch(normalized_name):
        raise ValueError("Binding must be an environment suffix such as REGION1.")
    return normalized_name


def get_use_case_binding(
    repository: UseCaseResourceSettingsRepository,
    use_case: str,
) -> UseCaseBinding | None:
    return repository.get_binding(use_case)


def resolve_use_case_binding(
    repository: UseCaseResourceSettingsRepository,
    use_case: str,
) -> FoundryBinding | None:
    mapping = get_use_case_binding(repository, use_case)
    return resolve_foundry_binding(mapping.binding) if mapping else None


def save_use_case_binding(
    repository: UseCaseResourceSettingsRepository,
    use_case: str,
    binding: str,
) -> UseCaseBinding:
    normalized_binding = normalize_binding_name(binding)
    resolve_foundry_binding(normalized_binding)
    mapping = UseCaseBinding(use_case=use_case.strip(), binding=normalized_binding)
    if not mapping.use_case:
        raise ValueError("Use case cannot be blank.")
    repository.save_binding(mapping)
    return mapping


def get_use_case_model_map(
    repository: UseCaseResourceSettingsRepository,
) -> str | None:
    settings = repository.get_binding(MODEL_MAP_USE_CASE)
    return settings.binding if settings else None


def save_use_case_model_map(
    repository: UseCaseResourceSettingsRepository,
    payload: str,
) -> None:
    repository.save_binding(UseCaseBinding(use_case=MODEL_MAP_USE_CASE, binding=payload))
