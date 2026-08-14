from typing import Any

from app.api.features.admin.schemas import AdminDeploymentRequest, ModelRouterRoutingRequest
from app.application.foundry_admin import (
    AdminConfigDocument,
    AdministrationService,
    DeploymentRequest,
    admin_config_to_dict,
    load_admin_config,
)
from app.application.models import ModelService, settings_to_dict
from app.core.concurrency import run_model_call
from app.core.errors import ExternalServiceError
from app.domain.models import ModelSettings


def deployment_config() -> AdminConfigDocument:
    return admin_config_to_dict(load_admin_config())


async def create_guardrail_policy_copies(
    administration: AdministrationService,
) -> dict[str, Any]:
    try:
        policies = await run_model_call(administration.create_guardrail_policy_copies)
    except Exception as exc:
        raise ExternalServiceError("Guardrail policy copy creation") from exc
    return {"policies": policies}


async def create_deployment(
    administration: AdministrationService,
    model_service: ModelService,
    payload: AdminDeploymentRequest,
) -> dict[str, Any]:
    try:
        deployment = await run_model_call(
            administration.create_deployment,
            DeploymentRequest(
                deployment_name=payload.deployment_name,
                model_name=payload.model_name,
                model_version=payload.model_version,
                model_format=payload.model_format,
                sku_name=payload.sku_name,
                sku_capacity=payload.sku_capacity,
                version_upgrade_option=payload.version_upgrade_option,
                rai_policy_name=payload.rai_policy_name,
                wait_for_completion=payload.wait_for_completion,
            ),
        )
    except Exception as exc:
        raise ExternalServiceError("Model deployment") from exc
    settings = model_service.save(
        ModelSettings(
            model=payload.deployment_name,
            api_surface=payload.api_surface,
            modalities=tuple(payload.modalities),
        )
    )
    return {
        "deployment": deployment,
        "settings": settings_to_dict(settings),
    }


async def get_model_router_routing(
    administration: AdministrationService,
    deployment_name: str,
) -> dict[str, Any]:
    try:
        return await run_model_call(administration.model_router_routing, deployment_name)
    except Exception as exc:
        raise ExternalServiceError("Model router routing lookup") from exc


async def save_model_router_routing(
    administration: AdministrationService,
    deployment_name: str,
    payload: ModelRouterRoutingRequest,
) -> dict[str, Any]:
    try:
        return await run_model_call(
            administration.update_model_router_routing,
            deployment_name,
            payload.mode,
        )
    except Exception as exc:
        raise ExternalServiceError("Model router routing update") from exc
