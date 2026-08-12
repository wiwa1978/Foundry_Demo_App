import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from app.api.dependencies import current_user_scope
from app.api.schemas import (
    RealtimeSessionRequest,
    RealtimeTranscriptionSessionRequest,
    normalize_reasoning_effort,
)
from app.core.concurrency import run_model_call
from app.core.errors import ExternalServiceError, InvalidRequestError
from app.domain.identity import UserScope
from app.infrastructure.azure.foundry.realtime import (
    create_realtime_client_secret,
    create_realtime_transcription_client_secret,
)
from app.infrastructure.azure.foundry.settings import load_settings
from app.infrastructure.azure.foundry.speech import transcribe_audio, transcribe_speech_audio
from usecases_media.shared.voice.backend.schemas import (
    RealtimeSessionResponse,
    RealtimeTranscriptionSessionResponse,
    TraditionalVoiceResponse,
    TranscriptionResponse,
)
from usecases_media.shared.voice.backend.service import TraditionalVoiceService
from usecases_media.shared.voice.backend.websockets import router as websocket_router

router = APIRouter(tags=["Voice"])
logger = logging.getLogger(__name__)
MAX_AUDIO_BYTES = 25 * 1024 * 1024


def get_traditional_voice_service(request: Request) -> TraditionalVoiceService:
    return request.app.state.traditional_voice_service


@router.post(
    "/api/realtime/session",
    response_model=RealtimeSessionResponse,
    response_model_exclude_unset=True,
)
async def create_realtime_session(request: RealtimeSessionRequest) -> dict:
    try:
        session = await run_model_call(
            create_realtime_client_secret,
            model=request.model,
            instructions=request.instructions
            or "You are a helpful Foundry voice assistant. Keep responses concise.",
            voice=request.voice or "alloy",
        )
        return {
            **session,
            "guardrail_comparison_available": False,
            "configured_guardrail_policy_name": None,
            "guardrail_status": "Realtime uses the deployment-assigned policy.",
        }
    except Exception as exc:
        logger.exception("realtime_session_creation_failed")
        raise ExternalServiceError("Realtime session creation") from exc


@router.post(
    "/api/realtime-transcription/session",
    response_model=RealtimeTranscriptionSessionResponse,
    response_model_exclude_unset=True,
)
async def create_realtime_transcription_session(
    request: RealtimeTranscriptionSessionRequest,
) -> dict:
    try:
        return await run_model_call(
            create_realtime_transcription_client_secret,
            language=request.language,
            delay=request.delay,
            turn_detection=request.turn_detection,
        )
    except Exception as exc:
        logger.exception("realtime_transcription_session_creation_failed")
        raise ExternalServiceError("Realtime transcription session creation") from exc


@router.post(
    "/api/transcriptions",
    response_model=TranscriptionResponse,
    response_model_exclude_unset=True,
)
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Form("en-US"),
    model: str = Form(...),
) -> dict:
    audio_bytes = await audio.read(MAX_AUDIO_BYTES + 1)
    if not audio_bytes:
        raise HTTPException(status_code=422, detail="Recorded audio was empty.")
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Recorded audio cannot exceed 25 MB.")
    selected_model = model.strip()
    if not selected_model:
        raise HTTPException(status_code=422, detail="Transcription model cannot be blank.")
    try:
        if selected_model.lower() == load_settings().speech_transcription_model.lower():
            result = await run_model_call(
                transcribe_speech_audio,
                audio=audio_bytes,
                language=language.strip() or "en-US",
                model=selected_model,
            )
        else:
            result = await run_model_call(
                transcribe_audio,
                audio=audio_bytes,
                filename=audio.filename or "transcription.wav",
                content_type=audio.content_type,
                model=selected_model,
            )
            result["language"] = language.strip() or "en-US"
        if not result["text"]:
            raise RuntimeError("The selected model did not recognize any speech in the audio.")
        return result
    except Exception as exc:
        logger.exception("audio_transcription_failed")
        raise ExternalServiceError("Audio transcription") from exc


@router.post(
    "/api/voice/traditional",
    response_model=TraditionalVoiceResponse,
    response_model_exclude_unset=True,
)
async def post_traditional_voice(
    scope: Annotated[UserScope, Depends(current_user_scope)],
    service: Annotated[TraditionalVoiceService, Depends(get_traditional_voice_service)],
    audio: UploadFile = File(...),
    model: str = Form(...),
    transcription_model: str | None = Form(None),
    tts_model: str | None = Form(None),
    tts_voice: str | None = Form(None),
    conversation_id: str | None = Form(None),
    reasoning_effort: str | None = Form(None),
    use_case: str = Form("traditional_voice"),
) -> dict:
    model = model.strip()
    if not model:
        raise HTTPException(status_code=422, detail="Model deployment name cannot be blank.")
    try:
        normalized_reasoning_effort = normalize_reasoning_effort(reasoning_effort)
    except ValueError as exc:
        raise InvalidRequestError(str(exc)) from exc
    audio_bytes = await audio.read(MAX_AUDIO_BYTES + 1)
    if not audio_bytes:
        raise HTTPException(status_code=422, detail="Recorded audio was empty.")
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Recorded audio cannot exceed 25 MB.")

    return await service.process(
        scope=scope,
        audio=audio_bytes,
        filename=audio.filename or "recording.webm",
        content_type=audio.content_type,
        model=model,
        transcription_model=transcription_model,
        tts_model=tts_model,
        tts_voice=tts_voice,
        conversation_id=conversation_id,
        reasoning_effort=normalized_reasoning_effort,
        use_case=use_case,
    )


router.include_router(websocket_router)
