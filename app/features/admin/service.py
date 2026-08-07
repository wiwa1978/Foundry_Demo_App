from typing import Any

from app.concurrency import run_model_call
from app.errors import ExternalServiceError
from app.foundry_admin import (
    AdminConfigDocument,
    DeploymentRequest,
    admin_config_to_dict,
    create_foundry_deployment,
    load_admin_config,
)
from app.model_settings import ModelSettings, save_model_settings, settings_to_dict
from app.schemas import AdminDeploymentRequest


def deployment_config() -> AdminConfigDocument:
    return admin_config_to_dict(load_admin_config())


async def create_deployment(payload: AdminDeploymentRequest) -> dict[str, Any]:
    try:
        deployment = await run_model_call(
            create_foundry_deployment,
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
    settings = save_model_settings(
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
