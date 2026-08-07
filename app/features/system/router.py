import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.document_store import load_rag_search_settings
from app.features.system.schemas import ConfigResponse, HealthResponse, ReadinessResponse
from app.persistence import check_persistence
from app.providers.settings import load_settings
from app.security import AuthMode, auth_mode

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get(
    "/api/config",
    response_model=ConfigResponse,
    response_model_exclude_unset=True,
)
def get_config() -> dict:
    settings = load_settings()
    rag_settings = load_rag_search_settings()
    return {
        "entra_auth_enabled": auth_mode() is not AuthMode.DISABLED,
        "is_configured": settings.is_configured,
        "endpoint": settings.endpoint,
        "auth_mode": settings.auth_mode,
        "models": settings.models,
        "is_realtime_configured": settings.is_realtime_configured,
        "realtime_endpoint": settings.realtime_endpoint,
        "realtime_model": settings.realtime_model,
        "embedding_model": settings.embedding_model,
        "is_document_rag_configured": rag_settings.is_configured,
        "search_endpoint": rag_settings.endpoint,
        "search_index_name": rag_settings.index_name,
        "storage_account_url": rag_settings.storage_account_url,
        "storage_container_name": rag_settings.storage_container_name,
        "is_traditional_voice_configured": settings.is_traditional_voice_configured,
        "transcription_model": settings.transcription_model,
        "tts_model": settings.tts_model,
        "tts_voice": settings.tts_voice,
        "is_speech_transcription_configured": settings.is_speech_transcription_configured,
        "speech_transcription_model": settings.speech_transcription_model,
        "is_voice_live_configured": settings.is_voice_live_configured,
        "voice_live_model": settings.voice_live_model,
        "voice_live_voice": settings.voice_live_voice,
        "is_live_interpreter_configured": settings.is_live_interpreter_configured,
    }


@router.get("/api/health", response_model=HealthResponse)
def get_health() -> dict:
    return {"status": "ok"}


@router.get("/api/ready", response_model=ReadinessResponse)
def get_readiness() -> JSONResponse:
    try:
        check_persistence()
    except Exception:
        logger.exception("persistence_readiness_failed")
        return JSONResponse(status_code=503, content={"status": "not_ready"})
    return JSONResponse(content={"status": "ready"})
