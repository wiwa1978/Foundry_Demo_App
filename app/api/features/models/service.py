import logging
from typing import Any

from app.api.features.models.schemas import ModelSettingsRequest
from app.application.foundry_admin import AdministrationService
from app.application.models import ModelService, settings_to_dict
from app.core.errors import ExternalServiceError, InvalidRequestError
from app.domain.models import DEPLOYMENT_DEFAULT_GUARDRAIL, ModelSettings
from app.infrastructure.azure.foundry.settings import load_settings

logger = logging.getLogger(__name__)


def update_model_settings(
    administration: AdministrationService,
    model_service: ModelService,
    payload: ModelSettingsRequest,
) -> ModelSettings:
    if payload.guardrail_policy_names:
        if len(payload.guardrail_policy_names) != 2:
            raise InvalidRequestError("Select two guardrails for comparison.")
        if payload.guardrail_policy_names[0].lower() == payload.guardrail_policy_names[1].lower():
            raise InvalidRequestError("Select two different guardrails for comparison.")
        try:
            missing_policies = [
                policy_name
                for policy_name in payload.guardrail_policy_names
                if policy_name != DEPLOYMENT_DEFAULT_GUARDRAIL
                and not administration.guardrail_policy_exists(policy_name)
            ]
        except Exception as exc:
            logger.exception("Guardrail policy validation failed", exc_info=exc)
            raise ExternalServiceError("Guardrail policy validation") from exc
        if missing_policies:
            raise InvalidRequestError("A selected guardrail no longer exists or is not selectable.")

    return model_service.save(
        ModelSettings(
            **{
                **payload.model_dump(exclude={"guardrail_policy_names"}),
                "guardrail_policy_names": tuple(payload.guardrail_policy_names),
            }
        )
    )


def discover_models(
    administration: AdministrationService,
    model_service: ModelService,
) -> dict[str, Any]:
    settings = load_settings(model_service.list())
    configured_models = settings.models
    try:
        deployments = administration.list_deployments()
    except Exception as exc:
        status_code = getattr(exc, "status_code", None)
        if status_code in {401, 403}:
            logger.warning(
                "Model discovery unavailable status=%s; using configured model names.",
                status_code,
            )
        else:
            logger.exception("Model discovery failed", exc_info=exc)
        return {
            "models": configured_models,
            "transcription_models": list(
                dict.fromkeys(
                    model
                    for model in (
                        settings.speech_transcription_model,
                        settings.transcription_model,
                    )
                    if model.strip()
                )
            ),
            "traditional_transcription_models": [settings.transcription_model]
            if settings.transcription_model.strip()
            else [],
            "tts_models": [settings.tts_model] if settings.tts_model.strip() else [],
            "deployments": [],
            "discovery_error": "Model discovery failed. Try again later.",
        }

    discovered_models = [deployment["name"] for deployment in deployments]
    models = list(
        dict.fromkeys(model for model in [*discovered_models, *configured_models] if model.strip())
    )
    transcription_models = list(
        dict.fromkeys(
            [
                deployment["name"]
                for deployment in deployments
                if is_transcription_model(deployment.get("model_name") or deployment["name"])
                or is_transcription_model(deployment["name"])
            ]
            + [
                model
                for model in (
                    settings.speech_transcription_model,
                    settings.transcription_model,
                )
                if model.strip()
            ]
        )
    )
    traditional_transcription_models = [
        deployment["name"]
        for deployment in deployments
        if is_transcription_model(deployment.get("model_name") or deployment["name"])
        or is_transcription_model(deployment["name"])
    ]
    tts_models = [
        deployment["name"]
        for deployment in deployments
        if is_tts_model(deployment.get("model_name") or deployment["name"])
        or is_tts_model(deployment["name"])
    ]
    return {
        "models": models,
        "transcription_models": transcription_models,
        "traditional_transcription_models": traditional_transcription_models,
        "tts_models": tts_models,
        "deployments": deployments,
        "model_modalities": {model: list(model_service.get(model).modalities) for model in models},
        "discovery_error": None,
    }


def registered_model_response(
    model_service: ModelService,
    model: str,
) -> dict[str, Any]:
    settings = model_service.register(model)
    return {
        "models": model_service.list(),
        "settings": settings_to_dict(settings),
    }


def is_transcription_model(model: str) -> bool:
    normalized_model = model.strip().lower()
    return "transcribe" in normalized_model or "whisper" in normalized_model


def is_tts_model(model: str) -> bool:
    normalized_model = model.strip().lower()
    return "gpt-audio" in normalized_model or normalized_model in {
        "gpt-4o-mini-tts",
        "tts",
        "tts-hd",
        "tts-1",
        "tts-1-hd",
    }
