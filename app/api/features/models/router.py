import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.api.dependencies import administration_service as get_administration_service
from app.api.dependencies import model_service as get_model_service
from app.api.dependencies import privileged_user_scope
from app.api.dependencies import use_case_settings_service as get_use_case_settings_service
from app.api.features.models.schemas import (
    DeploymentGuardrailPolicyResponse,
    GuardrailPolicyListResponse,
    ModelRegistrationRequest,
    ModelRegistrationResponse,
    ModelSettingsRequest,
    ModelSettingsResponse,
    ModelsResponse,
)
from app.api.features.models.service import (
    discover_models,
    registered_model_response,
    update_model_settings,
    use_case_model_map,
)
from app.application.foundry_admin import (
    AdministrationService,
    DeploymentGuardrailPolicy,
)
from app.application.models import ModelService, settings_to_dict
from app.application.use_case_settings import UseCaseSettingsService
from app.core.errors import ApplicationError, ExternalServiceError
from app.core.observability import audit_event
from app.domain.identity import UserScope

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/api/model-settings", response_model=ModelSettingsResponse)
def get_settings(
    model: str,
    models: Annotated[ModelService, Depends(get_model_service)],
) -> dict:
    return settings_to_dict(models.get(model))


@router.put("/api/model-settings", response_model=ModelSettingsResponse)
def put_settings(
    payload: ModelSettingsRequest,
    request: Request,
    _admin: Annotated[UserScope, Depends(privileged_user_scope)],
    administration: Annotated[
        AdministrationService, Depends(get_administration_service)
    ],
    models: Annotated[ModelService, Depends(get_model_service)],
) -> dict:
    settings = update_model_settings(payload, administration, models)
    audit_event("model_settings_updated", request=request, model=settings.model)
    return settings_to_dict(settings)


@router.get("/api/guardrails/policies", response_model=GuardrailPolicyListResponse)
def get_guardrail_policies(
    administration: Annotated[AdministrationService, Depends(get_administration_service)],
) -> dict:
    try:
        return {"policies": administration.list_guardrail_policies()}
    except Exception as exc:
        logger.exception("Guardrail policy discovery failed", exc_info=exc)
        raise ExternalServiceError("Guardrail policy discovery") from exc


@router.get(
    "/api/guardrails/deployment-policy",
    response_model=DeploymentGuardrailPolicyResponse,
)
def get_guardrail_deployment_policy(
    administration: Annotated[AdministrationService, Depends(get_administration_service)],
    model: str = Query(min_length=1),
) -> DeploymentGuardrailPolicy:
    try:
        return administration.deployment_guardrail_policy(model)
    except ApplicationError:
        raise
    except Exception as exc:
        logger.exception("Deployment policy lookup failed", exc_info=exc)
        raise ExternalServiceError("Deployment policy lookup") from exc


@router.post("/api/models", response_model=ModelRegistrationResponse)
def post_model(
    payload: ModelRegistrationRequest,
    request: Request,
    _admin: Annotated[UserScope, Depends(privileged_user_scope)],
    models: Annotated[ModelService, Depends(get_model_service)],
) -> dict:
    response = registered_model_response(models, payload.model)
    audit_event("model_registered", request=request, model=payload.model)
    return response


@router.get(
    "/api/models",
    response_model=ModelsResponse,
    response_model_exclude_unset=True,
)
def get_models(
    administration: Annotated[
        AdministrationService, Depends(get_administration_service)
    ],
    models: Annotated[ModelService, Depends(get_model_service)],
    settings_service: Annotated[
        UseCaseSettingsService, Depends(get_use_case_settings_service)
    ],
) -> dict:
    return discover_models(
        administration,
        models,
        use_case_model_map(settings_service.get_model_map()),
    )
