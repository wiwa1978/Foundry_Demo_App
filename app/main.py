import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException

from app.api_middleware import require_authenticated_api_user
from app.config import load_environment, load_runtime_settings
from app.errors import (
    ApplicationError,
    application_error_handler,
    http_error_handler,
    request_validation_error_handler,
)
from app.observability import (
    configure_logging,
    request_context_middleware,
    unexpected_error_handler,
)
from app.persistence import initialize_persistence
from app.security import AuthMode, admin_principals, auth_mode
from app.static_routes import mount_static_assets
from app.static_routes import router as static_router

load_environment()
runtime_settings = load_runtime_settings()
configure_logging(runtime_settings.log_level)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    initialize_persistence()
    _log_authorization_posture()
    logger.info("application_started persistence_ready=true")
    yield


def _log_authorization_posture() -> None:
    mode = auth_mode()
    if mode is AuthMode.DISABLED:
        logger.warning(
            "authorization_open mode=disabled reason=%s",
            "every caller can mutate global model settings and create Azure deployments",
        )
    elif not admin_principals():
        logger.warning(
            "authorization_locked mode=%s reason=%s",
            mode.value,
            "ADMIN_PRINCIPALS is empty so privileged endpoints deny all callers",
        )


def create_app() -> FastAPI:
    from app.features.admin.router import router as admin_router
    from app.features.agent_research.router import router as agent_research_router
    from app.features.auth.router import router as auth_router
    from app.features.conversations.router import router as conversations_router
    from app.features.hosted_agent.router import router as hosted_agent_router
    from app.features.models.router import router as models_router
    from app.features.system.router import router as system_router
    from usecases_media.document_qa.backend import router as document_qa_router
    from usecases_media.stt_chat_tts.backend import router as voice_router
    from usecases_media.text_chat.backend import router as text_chat_router
    from usecases_media.text_chat_comparison.backend import router as comparison_router
    from usecases_media.text_to_image.backend import router as images_router
    from usecases_media.youtube_summary.backend import router as youtube_summary_router

    application = FastAPI(title="Foundry Chat App", lifespan=lifespan)
    mount_static_assets(application)
    application.middleware("http")(require_authenticated_api_user)
    application.middleware("http")(request_context_middleware)
    application.add_exception_handler(ApplicationError, application_error_handler)
    application.add_exception_handler(HTTPException, http_error_handler)
    application.add_exception_handler(RequestValidationError, request_validation_error_handler)
    application.add_exception_handler(Exception, unexpected_error_handler)
    application.include_router(text_chat_router)
    application.include_router(document_qa_router)
    application.include_router(voice_router)
    application.include_router(youtube_summary_router)
    application.include_router(images_router)
    application.include_router(comparison_router)
    application.include_router(conversations_router)
    application.include_router(agent_research_router)
    application.include_router(hosted_agent_router)
    application.include_router(system_router)
    application.include_router(auth_router)
    application.include_router(models_router)
    application.include_router(admin_router)
    application.include_router(static_router)
    return application


app = create_app()
