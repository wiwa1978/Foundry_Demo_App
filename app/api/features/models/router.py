import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.api.dependencies import privileged_user_scope
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
)
from app.application.foundry_admin import (
    DeploymentGuardrailPolicy,
    get_deployment_guardrail_policy,
    list_guardrail_policies,
)
from app.application.models import get_model_settings, settings_to_dict
from app.core.errors import ApplicationError, ExternalServiceError
from app.core.observability import audit_event
from app.domain.identity import UserScope

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/api/model-settings", response_model=ModelSettingsResponse)
def get_settings(model: str) -> dict:
    return settings_to_dict(get_model_settings(model))


@router.put("/api/model-settings", response_model=ModelSettingsResponse)
def put_settings(
    payload: ModelSettingsRequest,
    request: Request,
    _admin: Annotated[UserScope, Depends(privileged_user_scope)],
) -> dict:
    settings = update_model_settings(payload)
    audit_event("model_settings_updated", request=request, model=settings.model)
    return settings_to_dict(settings)


@router.get("/api/guardrails/policies", response_model=GuardrailPolicyListResponse)
def get_guardrail_policies() -> dict:
    try:
        return {"policies": list_guardrail_policies()}
    except Exception as exc:
        logger.exception("Guardrail policy discovery failed", exc_info=exc)
        raise ExternalServiceError("Guardrail policy discovery") from exc


@router.get(
    "/api/guardrails/deployment-policy",
    response_model=DeploymentGuardrailPolicyResponse,
)
def get_guardrail_deployment_policy(
    model: str = Query(min_length=1),
) -> DeploymentGuardrailPolicy:
    try:
        return get_deployment_guardrail_policy(model)
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
) -> dict:
    response = registered_model_response(payload.model)
    audit_event("model_registered", request=request, model=payload.model)
    return response


@router.get(
    "/api/models",
    response_model=ModelsResponse,
    response_model_exclude_unset=True,
)
def get_models() -> dict:
    return discover_models()
