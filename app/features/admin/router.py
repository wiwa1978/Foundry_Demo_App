from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.features.admin.schemas import (
    AdminDeploymentConfigResponse,
    AdminDeploymentResponse,
)
from app.features.admin.service import create_deployment, deployment_config
from app.features.dependencies import privileged_user_scope
from app.foundry_admin import AdminConfigDocument
from app.observability import audit_event
from app.schemas import AdminDeploymentRequest
from app.security import UserScope

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
