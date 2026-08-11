from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.api.dependencies import privileged_user_scope
from app.api.features.admin.schemas import (
    AdminDeploymentConfigResponse,
    AdminDeploymentRequest,
    AdminDeploymentResponse,
    UseCaseResourceSettingsRequest,
    UseCaseResourceSettingsResponse,
)
from app.api.features.admin.service import (
    create_deployment,
    create_guardrail_policy_copies,
    deployment_config,
)
from app.api.features.models.schemas import GuardrailPolicyListResponse
from app.application.foundry_admin import AdminConfigDocument
from app.application.use_case_settings import (
    LIVE_TRANSLATION_USE_CASE,
    get_use_case_binding,
    list_foundry_bindings,
    save_use_case_binding,
)
from app.core.observability import audit_event
from app.domain.identity import UserScope

router = APIRouter()


@router.get(
    "/api/admin/deployments/config",
    response_model=AdminDeploymentConfigResponse,
)
def get_admin_deployment_config(
    _admin: Annotated[UserScope, Depends(privileged_user_scope)],
) -> AdminConfigDocument:
    return deployment_config()


@router.post(
    "/api/admin/deployments",
    response_model=AdminDeploymentResponse,
    response_model_exclude_unset=True,
)
async def post_admin_deployment(
    payload: AdminDeploymentRequest,
    request: Request,
    _admin: Annotated[UserScope, Depends(privileged_user_scope)],
) -> dict:
    result = await create_deployment(payload)
    audit_event("model_deployment_created", request=request, model=payload.deployment_name)
    return result


@router.post(
    "/api/admin/guardrails/selectable-copies",
    response_model=GuardrailPolicyListResponse,
)
async def post_guardrail_policy_copies(
    request: Request,
    _admin: Annotated[UserScope, Depends(privileged_user_scope)],
) -> dict:
    result = await create_guardrail_policy_copies()
    audit_event("guardrail_policy_copies_created", request=request)
    return result


@router.get(
    "/api/admin/use-case-settings/live_translation",
    response_model=UseCaseResourceSettingsResponse,
)
def get_live_translation_settings(
    _admin: Annotated[UserScope, Depends(privileged_user_scope)],
) -> dict:
    settings = get_use_case_binding(LIVE_TRANSLATION_USE_CASE)
    return {
        "use_case": LIVE_TRANSLATION_USE_CASE,
        "binding": settings.binding if settings else "",
        "available_bindings": [binding.name for binding in list_foundry_bindings()],
    }


@router.put(
    "/api/admin/use-case-settings/live_translation",
    response_model=UseCaseResourceSettingsResponse,
)
def put_live_translation_settings(
    payload: UseCaseResourceSettingsRequest,
    request: Request,
    _admin: Annotated[UserScope, Depends(privileged_user_scope)],
) -> dict:
    settings = save_use_case_binding(LIVE_TRANSLATION_USE_CASE, payload.binding)
    audit_event("use_case_resource_settings_updated", request=request, use_case=settings.use_case)
    return {
        **settings.__dict__,
        "available_bindings": [binding.name for binding in list_foundry_bindings()],
    }
