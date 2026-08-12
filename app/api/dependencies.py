from fastapi import HTTPException, Request

from app.api.security import AuthorizationError, require_privileged_user, user_scope
from app.application.chat import ChatService
from app.application.conversations import ConversationService
from app.application.foundry_admin import AdministrationService
from app.application.models import ModelService
from app.application.services import ApplicationServices
from app.application.use_case_settings import UseCaseSettingsService
from app.domain.identity import UserScope

AUTHENTICATION_REQUIRED_DETAIL = "Authentication is required."


def application_services(request: Request) -> ApplicationServices:
    return request.app.state.services


def chat_service(request: Request) -> ChatService:
    return application_services(request).chat


def administration_service(request: Request) -> AdministrationService:
    return application_services(request).administration


def conversation_service(request: Request) -> ConversationService:
    return application_services(request).conversations


def model_service(request: Request) -> ModelService:
    return application_services(request).models


def use_case_settings_service(request: Request) -> UseCaseSettingsService:
    return application_services(request).use_case_settings


def current_user_scope(request: Request) -> UserScope:
    """Resolve the caller's tenant/user scope, or fail with 401."""
    try:
        return user_scope(request)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=AUTHENTICATION_REQUIRED_DETAIL) from exc


def privileged_user_scope(request: Request) -> UserScope:
    """Resolve the caller's scope and assert administrator privileges.

    Used by endpoints that mutate global state or provision billable Azure resources.
    """
    try:
        return require_privileged_user(request)
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=AUTHENTICATION_REQUIRED_DETAIL) from exc
