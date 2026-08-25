import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException

from app.api.middleware import require_authenticated_api_user
from app.api.security import AuthMode, admin_principals, auth_mode
from app.api.static import mount_static_assets
from app.api.static import router as static_router
from app.composition import (
    build_application_services,
    build_document_qa_service,
    build_traditional_voice_service,
)
from app.core.config import load_environment, load_runtime_settings
from app.core.errors import (
    ApplicationError,
    application_error_handler,
    http_error_handler,
    request_validation_error_handler,
)
from app.core.observability import (
    configure_logging,
    request_context_middleware,
    unexpected_error_handler,
)
from app.infrastructure.persistence.registry import initialize_persistence

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
    from app.api.features.admin.router import router as admin_router
    from app.api.features.auth.router import router as auth_router
    from app.api.features.conversations.router import router as conversations_router
    from app.api.features.models.router import router as models_router
    from app.api.features.system.router import router as system_router
    from usecases_agents.azure_architect_agent.prompt.backend.router import (
        router as azure_architect_agent_router,
    )
    from usecases_agents.hosted_agent.backend.router import router as hosted_agent_router
    from usecases_agents.investment_planner_prompt.backend.router import (
        router as investment_planner_router,
    )
    from usecases_agents.retail_agent.backend.router import router as retail_agent_router
    from usecases_media.content_extractor.backend.router import router as content_extractor_router
    from usecases_media.document_qa.backend.router import router as document_qa_router
    from usecases_media.guardrail_batch.backend.router import router as guardrail_batch_router
    from usecases_media.shared.images.backend.router import router as images_router
    from usecases_media.shared.voice.backend.router import router as voice_router
    from usecases_media.text_chat.backend.router import router as text_chat_router
    from usecases_media.text_chat_comparison.backend.router import router as comparison_router
    from usecases_media.text_translation.backend.router import router as text_translation_router
    from usecases_media.video_translation.backend.router import router as video_translation_router
    from usecases_media.youtube_realtime_transcription.backend.router import (
        router as youtube_realtime_transcription_router,
    )
    from usecases_media.youtube_summary.backend.router import router as youtube_summary_router

    application = FastAPI(title="Foundry Chat App", lifespan=lifespan)
    application.state.services = build_application_services()
    application.state.document_qa_service = build_document_qa_service(application.state.services)
    application.state.traditional_voice_service = build_traditional_voice_service(
        application.state.services
    )
    mount_static_assets(application)
    application.middleware("http")(require_authenticated_api_user)
    application.middleware("http")(request_context_middleware)
    application.add_exception_handler(ApplicationError, application_error_handler)
    application.add_exception_handler(HTTPException, http_error_handler)
    application.add_exception_handler(RequestValidationError, request_validation_error_handler)
    application.add_exception_handler(Exception, unexpected_error_handler)
    application.include_router(content_extractor_router)
    application.include_router(text_chat_router)
    application.include_router(document_qa_router)
    application.include_router(voice_router)
    application.include_router(youtube_summary_router)
    application.include_router(video_translation_router)
    application.include_router(youtube_realtime_transcription_router)
    application.include_router(images_router)
    application.include_router(comparison_router)
    application.include_router(guardrail_batch_router)
    application.include_router(text_translation_router)
    application.include_router(conversations_router)
    application.include_router(azure_architect_agent_router)
    application.include_router(hosted_agent_router)
    application.include_router(retail_agent_router)
    application.include_router(investment_planner_router)
    application.include_router(system_router)
    application.include_router(auth_router)
    application.include_router(models_router)
    application.include_router(admin_router)
    application.include_router(static_router)
    return application


app = create_app()
