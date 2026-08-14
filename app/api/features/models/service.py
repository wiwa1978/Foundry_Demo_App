import json
import logging
from typing import Any

from app.api.features.models.schemas import ModelSettingsRequest
from app.application.foundry_admin import AdministrationService
from app.application.models import ModelService, settings_to_dict
from app.core.config import env_text
from app.core.errors import ExternalServiceError, InvalidRequestError
from app.domain.models import DEPLOYMENT_DEFAULT_GUARDRAIL, ModelSettings
from app.infrastructure.azure.foundry.settings import load_settings

logger = logging.getLogger(__name__)

OPENAI_TRANSCRIPTION_MODELS = ("gpt-transcribe",)
MODEL_BUCKETS = frozenset(
    {
        "models",
        "image_models",
        "text_models",
        "transcription_models",
        "realtime_transcription_models",
        "traditional_transcription_models",
        "tts_models",
    }
)
DEFAULT_USE_CASE_MODEL_MAP: dict[str, str | dict[str, str]] = {
    "text_chat": "text_models",
    "agent_research": "text_models",
    "hosted_agent": "text_models",
    "document_qa": "text_models",
    "comparison": "text_models",
    "reasoning_comparison": "text_models",
    "youtube_summary": {
        "text": "text_models",
        "transcription": "transcription_models",
    },
    "youtube_realtime_transcription": "realtime_transcription_models",
    "transcribe": "transcription_models",
    "transcription_comparison": "transcription_models",
    "traditional_voice": {
        "transcription": "traditional_transcription_models",
        "tts": "tts_models",
    },
    "realtime_transcription_webrtc": "realtime_transcription_models",
    "realtime_transcription_websocket": "realtime_transcription_models",
    "realtime_translation_webrtc": {
        "translation": "models",
        "transcription": "realtime_transcription_models",
    },
    "realtime_translation_websocket": {
        "translation": "models",
        "transcription": "realtime_transcription_models",
    },
    "realtime_voice": "models",
    "voice_live": "models",
    "live_translation": "models",
    "text_to_image": "image_models",
    "image_to_image": "image_models",
    "image_comparison": "image_models",
    "browser_voice": "text_models",
}


def configured_transcription_models(settings: Any) -> list[str]:
    return list(
        dict.fromkeys(
            model
            for model in (
                settings.speech_transcription_model,
                settings.transcription_model,
                *OPENAI_TRANSCRIPTION_MODELS,
            )
            if model.strip() and not is_realtime_only_transcription_model(model)
        )
    )


def configured_realtime_transcription_models(settings: Any) -> list[str]:
    return list(
        dict.fromkeys(
            model
            for model in (
                getattr(settings, "realtime_transcription_model", ""),
                *getattr(settings, "realtime_transcription_models", []),
            )
            if model.strip()
        )
    )


def configured_use_case_model_map() -> dict[str, str | dict[str, str]]:
    configured = env_text("USE_CASE_MODEL_MAP")
    if configured is None:
        return _default_use_case_model_map()
    return _merge_use_case_model_maps(
        _default_use_case_model_map(),
        decode_use_case_model_map(configured),
    )


def use_case_model_map(saved_payload: str | None = None) -> dict[str, str | dict[str, str]]:
    base = configured_use_case_model_map()
    if saved_payload is not None:
        return _merge_use_case_model_maps(base, decode_use_case_model_map(saved_payload))
    return base


def decode_use_case_model_map(payload: str) -> dict[str, str | dict[str, str]]:
    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise RuntimeError("USE_CASE_MODEL_MAP must be valid JSON.") from exc
    return normalize_use_case_model_map(parsed)


def normalize_use_case_model_map(mapping: Any) -> dict[str, str | dict[str, str]]:
    if not isinstance(mapping, dict):
        raise RuntimeError("USE_CASE_MODEL_MAP must be a JSON object.")
    return {
        _validate_mapping_key(use_case, "use case"): _validate_bucket_mapping(value)
        for use_case, value in mapping.items()
    }


def _default_use_case_model_map() -> dict[str, str | dict[str, str]]:
    return {
        use_case: _copy_bucket_mapping(mapping)
        for use_case, mapping in DEFAULT_USE_CASE_MODEL_MAP.items()
    }


def _merge_use_case_model_maps(
    base: dict[str, str | dict[str, str]],
    override: dict[str, str | dict[str, str]],
) -> dict[str, str | dict[str, str]]:
    return {
        **{use_case: _copy_bucket_mapping(mapping) for use_case, mapping in base.items()},
        **{use_case: _copy_bucket_mapping(mapping) for use_case, mapping in override.items()},
    }


def _copy_bucket_mapping(mapping: str | dict[str, str]) -> str | dict[str, str]:
    return dict(mapping) if isinstance(mapping, dict) else mapping


def _validate_bucket_mapping(mapping: Any) -> str | dict[str, str]:
    if isinstance(mapping, str):
        return _validate_bucket_name(mapping)
    if isinstance(mapping, dict):
        return {
            _validate_mapping_key(role, "role"): _validate_bucket_name(bucket)
            for role, bucket in mapping.items()
        }
    raise RuntimeError(
        "USE_CASE_MODEL_MAP values must be bucket names or objects of role to bucket name."
    )


def _validate_mapping_key(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise RuntimeError(f"USE_CASE_MODEL_MAP {label} keys must be non-empty strings.")
    return value.strip()


def _validate_bucket_name(value: Any) -> str:
    if not isinstance(value, str) or value not in MODEL_BUCKETS:
        raise RuntimeError(
            f"USE_CASE_MODEL_MAP bucket names must be one of: {', '.join(sorted(MODEL_BUCKETS))}."
        )
    return value


def update_model_settings(
    payload: ModelSettingsRequest,
    administration: AdministrationService,
    models: ModelService,
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

    return models.save(
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
    model_map: dict[str, str | dict[str, str]] | None = None,
) -> dict[str, Any]:
    settings = load_settings()
    configured_models = model_service.list(settings.models)
    configured_transcription = configured_transcription_models(settings)
    configured_realtime_transcription = configured_realtime_transcription_models(settings)
    configured_modalities = {
        model: list(model_service.get(model).modalities) for model in configured_models
    }
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
        image_models = models_for_modality(configured_models, configured_modalities, "image")
        return {
            "models": configured_models,
            "text_models": text_models_for(
                configured_models,
                configured_modalities,
                [*configured_transcription, *image_models],
            ),
            "image_models": image_models,
            "transcription_models": configured_transcription,
            "realtime_transcription_models": configured_realtime_transcription,
            "traditional_transcription_models": [settings.transcription_model]
            if settings.transcription_model.strip()
            else [],
            "tts_models": [settings.tts_model] if settings.tts_model.strip() else [],
            "deployments": [],
            "model_modalities": configured_modalities,
            "use_case_model_map": model_map if model_map is not None else use_case_model_map(),
            "discovery_error": "Model discovery failed. Try again later.",
        }
    discovered_models = [deployment["name"] for deployment in deployments]

    model_names = list(
        dict.fromkeys(model for model in [*discovered_models, *configured_models] if model.strip())
    )
    transcription_models = list(
        dict.fromkeys(
            [
                deployment["name"]
                for deployment in deployments
                if is_recorded_audio_transcription_model(
                    deployment.get("model_name") or deployment["name"]
                )
                or is_recorded_audio_transcription_model(deployment["name"])
            ]
            + configured_transcription
        )
    )
    traditional_transcription_models = [
        deployment["name"]
        for deployment in deployments
        if is_recorded_audio_transcription_model(deployment.get("model_name") or deployment["name"])
        or is_recorded_audio_transcription_model(deployment["name"])
    ]
    realtime_transcription_models = list(
        dict.fromkeys(
            [
                deployment["name"]
                for deployment in deployments
                if is_realtime_only_transcription_model(
                    deployment.get("model_name") or deployment["name"]
                )
                or is_realtime_only_transcription_model(deployment["name"])
            ]
            + configured_realtime_transcription
        )
    )
    tts_models = [
        deployment["name"]
        for deployment in deployments
        if is_tts_model(deployment.get("model_name") or deployment["name"])
        or is_tts_model(deployment["name"])
    ]
    embedding_models = [
        deployment["name"]
        for deployment in deployments
        if is_embedding_model(deployment.get("model_name") or deployment["name"])
        or is_embedding_model(deployment["name"])
    ]
    model_modalities = {model: list(model_service.get(model).modalities) for model in model_names}
    image_models = models_for_modality(model_names, model_modalities, "image")

    return {
        "models": model_names,
        "text_models": text_models_for(
            model_names,
            model_modalities,
            [
                *transcription_models,
                *realtime_transcription_models,
                *embedding_models,
                *image_models,
            ],
        ),
        "image_models": image_models,
        "transcription_models": transcription_models,
        "realtime_transcription_models": realtime_transcription_models,
        "traditional_transcription_models": traditional_transcription_models,
        "tts_models": tts_models,
        "deployments": deployments,
        "model_modalities": model_modalities,
        "use_case_model_map": model_map if model_map is not None else use_case_model_map(),
        "discovery_error": None,
    }


def registered_model_response(
    model_service: ModelService,
    model: str,
) -> dict[str, Any]:
    settings = model_service.register(model)
    model_names = model_service.list(load_settings().models)
    return {
        "models": model_names,
        "settings": settings_to_dict(settings),
    }


def is_transcription_model(model: str) -> bool:
    normalized_model = model.strip().lower()
    return "transcribe" in normalized_model or "whisper" in normalized_model


def is_realtime_only_transcription_model(model: str) -> bool:
    normalized_model = model.strip().lower()
    return "realtime-whisper" in normalized_model or "live-transcribe" in normalized_model


def is_recorded_audio_transcription_model(model: str) -> bool:
    return is_transcription_model(model) and not is_realtime_only_transcription_model(model)


def is_tts_model(model: str) -> bool:
    normalized_model = model.strip().lower()
    return "gpt-audio" in normalized_model or normalized_model in {
        "gpt-4o-mini-tts",
        "tts",
        "tts-hd",
        "tts-1",
        "tts-1-hd",
    }


def is_image_model(model: str) -> bool:
    normalized_model = model.strip().lower()
    return any(
        token in normalized_model
        for token in ("mai-image", "gpt-image", "dall-e", "imagen", "vision", "flux")
    )


def is_embedding_model(model: str) -> bool:
    return "embedding" in model.strip().lower()


def models_for_modality(
    model_names: list[str],
    model_modalities: dict[str, list[str]],
    modality: str,
) -> list[str]:
    return [model for model in model_names if modality in model_modalities.get(model, [])]


def text_models_for(
    model_names: list[str],
    model_modalities: dict[str, list[str]],
    transcription_models: list[str],
) -> list[str]:
    return [
        model
        for model in model_names
        if "text" in model_modalities.get(model, [])
        and model not in transcription_models
        and not is_embedding_model(model)
    ]
