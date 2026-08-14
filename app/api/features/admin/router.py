import json
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.api.dependencies import administration_service as get_administration_service
from app.api.dependencies import model_service as get_model_service
from app.api.dependencies import privileged_user_scope
from app.api.dependencies import use_case_settings_service as get_use_case_settings_service
from app.api.features.admin.schemas import (
    AdminDeploymentConfigResponse,
    AdminDeploymentRequest,
    AdminDeploymentResponse,
    ModelRouterRoutingRequest,
    ModelRouterRoutingResponse,
    UseCaseModelMapRequest,
    UseCaseModelMapResponse,
    UseCaseResourceSettingsRequest,
    UseCaseResourceSettingsResponse,
)
from app.api.features.admin.service import (
    create_deployment,
    create_guardrail_policy_copies,
    deployment_config,
    get_model_router_routing,
    save_model_router_routing,
)
from app.api.features.models.schemas import GuardrailPolicyListResponse
from app.api.features.models.service import (
    MODEL_BUCKETS,
    normalize_use_case_model_map,
    use_case_model_map,
)
from app.application.foundry_admin import (
    AdminConfigDocument,
    AdministrationService,
    ModelRouterRouting,
)
from app.application.models import ModelService
from app.application.use_case_settings import (
    LIVE_TRANSLATION_USE_CASE,
    UseCaseSettingsService,
    list_foundry_bindings,
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
    models: Annotated[ModelService, Depends(get_model_service)],
    administration: Annotated[AdministrationService, Depends(get_administration_service)],
) -> dict:
    result = await create_deployment(administration, models, payload)
    audit_event("model_deployment_created", request=request, model=payload.deployment_name)
    return result



@router.get(
    "/api/admin/model-router/routing",
    response_model=ModelRouterRoutingResponse,
)
async def get_model_router_routing_mode(
    _admin: Annotated[UserScope, Depends(privileged_user_scope)],
    administration: Annotated[AdministrationService, Depends(get_administration_service)],
    deployment: Annotated[str, Query(min_length=1)] = "model-router",
) -> ModelRouterRouting:
    return await get_model_router_routing(administration, deployment)


@router.put(
    "/api/admin/model-router/routing",
    response_model=ModelRouterRoutingResponse,
)
async def put_model_router_routing_mode(
    payload: ModelRouterRoutingRequest,
    request: Request,
    _admin: Annotated[UserScope, Depends(privileged_user_scope)],
    administration: Annotated[AdministrationService, Depends(get_administration_service)],
    deployment: Annotated[str, Query(min_length=1)] = "model-router",
) -> ModelRouterRouting:
    result = await save_model_router_routing(administration, deployment, payload)
    audit_event(
        "model_router_routing_updated",
        request=request,
        model=deployment,
        mode=result["mode"],
    )
    return result

@router.post(
    "/api/admin/guardrails/selectable-copies",
    response_model=GuardrailPolicyListResponse,
)
async def post_guardrail_policy_copies(
    request: Request,
    _admin: Annotated[UserScope, Depends(privileged_user_scope)],
    administration: Annotated[AdministrationService, Depends(get_administration_service)],
) -> dict:
    result = await create_guardrail_policy_copies(administration)
    audit_event("guardrail_policy_copies_created", request=request)
    return result


@router.get(
    "/api/admin/use-case-settings/live_translation",
    response_model=UseCaseResourceSettingsResponse,
)
def get_live_translation_settings(
    _admin: Annotated[UserScope, Depends(privileged_user_scope)],
    settings_service: Annotated[UseCaseSettingsService, Depends(get_use_case_settings_service)],
) -> dict:
    settings = settings_service.get(LIVE_TRANSLATION_USE_CASE)
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
    settings_service: Annotated[UseCaseSettingsService, Depends(get_use_case_settings_service)],
) -> dict:
    settings = settings_service.save(LIVE_TRANSLATION_USE_CASE, payload.binding)
    audit_event(
        "use_case_resource_settings_updated",
        request=request,
        use_case=settings.use_case,
    )
    return {
        **settings.__dict__,
        "available_bindings": [binding.name for binding in list_foundry_bindings()],
    }


@router.get(
    "/api/admin/use-case-model-map",
    response_model=UseCaseModelMapResponse,
)
def get_use_case_model_map_settings(
    _admin: Annotated[UserScope, Depends(privileged_user_scope)],
    settings_service: Annotated[UseCaseSettingsService, Depends(get_use_case_settings_service)],
) -> dict:
    return {
        "use_case_model_map": use_case_model_map(settings_service.get_model_map()),
        "bucket_names": sorted(MODEL_BUCKETS),
    }


@router.put(
    "/api/admin/use-case-model-map",
    response_model=UseCaseModelMapResponse,
)
def put_use_case_model_map_settings(
    payload: UseCaseModelMapRequest,
    request: Request,
    _admin: Annotated[UserScope, Depends(privileged_user_scope)],
    settings_service: Annotated[UseCaseSettingsService, Depends(get_use_case_settings_service)],
) -> dict:
    model_map = normalize_use_case_model_map(payload.use_case_model_map)
    settings_service.save_model_map(json.dumps(model_map, separators=(",", ":"), sort_keys=True))
    audit_event("use_case_model_map_updated", request=request)
    return {
        "use_case_model_map": model_map,
        "bucket_names": sorted(MODEL_BUCKETS),
    }
