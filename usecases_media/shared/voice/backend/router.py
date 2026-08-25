import base64
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from app.api.dependencies import current_user_scope
from app.api.schemas import (
    RealtimeSessionRequest,
    RealtimeTranscriptionSessionRequest,
    RealtimeTranslationSessionRequest,
    normalize_reasoning_effort,
)
from app.core.concurrency import run_model_call
from app.core.errors import ExternalServiceError, InvalidRequestError
from app.domain.identity import UserScope
from app.infrastructure.azure.foundry.realtime import (
    create_realtime_client_secret,
    create_realtime_transcription_client_secret,
    create_realtime_translation_client_secret,
)
from app.infrastructure.azure.foundry.settings import load_settings
from app.infrastructure.azure.foundry.speech import (
    get_batch_avatar_synthesis,
    submit_batch_avatar_synthesis,
    synthesize_azure_speech,
    synthesize_speech,
    transcribe_audio,
    transcribe_speech_audio,
)
from usecases_media.shared.voice.backend.schemas import (
    RealtimeSessionResponse,
    RealtimeTranscriptionSessionResponse,
    TextToSpeechAvatarJobResponse,
    TextToSpeechAvatarRequest,
    TextToSpeechRequest,
    TextToSpeechResponse,
    TraditionalVoiceResponse,
    TranscriptionResponse,
)
from usecases_media.shared.voice.backend.service import TraditionalVoiceService
from usecases_media.shared.voice.backend.websockets import router as websocket_router

router = APIRouter(tags=["Voice"])
logger = logging.getLogger(__name__)
MAX_AUDIO_BYTES = 25 * 1024 * 1024


@router.post(
    "/api/text-to-speech",
    response_model=TextToSpeechResponse,
    response_model_exclude_unset=True,
)
async def text_to_speech(request: TextToSpeechRequest) -> dict:
    try:
        selected_model = request.model.strip() or "azure-speech"
        if selected_model.lower().startswith("gpt-audio"):
            result = await run_model_call(
                synthesize_speech,
                text=request.text,
                model=selected_model,
                voice=request.voice.strip() or "alloy",
            )
            result = {
                **result,
                "language": request.language,
                "emotion": request.emotion,
                "speech_request": {
                    "service": "Foundry audio",
                    "model": selected_model,
                    "voice": request.voice.strip() or "alloy",
                    "text_characters": len(request.text),
                },
            }
        else:
            result = await run_model_call(
                synthesize_azure_speech,
                text=request.text,
                voice=request.voice,
                language=request.language,
                emotion=request.emotion,
                pitch=request.pitch,
                rate=request.rate,
                volume=request.volume,
            )
        return {
            **result,
            "audio_base64": base64.b64encode(result.pop("audio")).decode("ascii"),
        }
    except Exception as exc:
        logger.exception("azure_speech_synthesis_failed")
        raise ExternalServiceError("Azure Speech synthesis") from exc


@router.post(
    "/api/text-to-speech-avatar",
    response_model=TextToSpeechAvatarJobResponse,
    response_model_exclude_unset=True,
)
async def submit_text_to_speech_avatar(request: TextToSpeechAvatarRequest) -> dict:
    try:
        return await run_model_call(
            submit_batch_avatar_synthesis,
            text=request.text,
            avatar_type=request.avatar_type,
            character=request.character,
            style=request.style,
            voice=request.voice,
            custom_voice_endpoint_id=request.custom_voice_endpoint_id,
            customized=request.customized,
            use_built_in_voice=request.use_built_in_voice,
            background_color=request.background_color,
            background_image=request.background_image,
        )
    except Exception as exc:
        logger.exception("text_to_speech_avatar_submission_failed")
        raise ExternalServiceError("Text to Speech Avatar submission") from exc


@router.get(
    "/api/text-to-speech-avatar/{job_id}",
    response_model=TextToSpeechAvatarJobResponse,
    response_model_exclude_unset=True,
)
async def get_text_to_speech_avatar(job_id: str) -> dict:
    try:
        return await run_model_call(get_batch_avatar_synthesis, job_id=job_id)
    except Exception as exc:
        logger.exception("text_to_speech_avatar_status_failed")
        raise ExternalServiceError("Text to Speech Avatar status") from exc


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
            model=request.model,
            language=request.language,
            delay=request.delay,
            turn_detection=request.turn_detection,
        )
    except Exception as exc:
        logger.exception("realtime_transcription_session_creation_failed")
        raise ExternalServiceError("Realtime transcription session creation") from exc


@router.post(
    "/api/realtime-translation/session",
    response_model=RealtimeTranscriptionSessionResponse,
    response_model_exclude_unset=True,
)
async def create_realtime_translation_session(
    request: RealtimeTranslationSessionRequest,
) -> dict:
    try:
        return await run_model_call(
            create_realtime_translation_client_secret,
            model=request.model,
            source_language=request.source_language,
            target_language=request.target_language or "fr",
            transcription_model=request.transcription_model,
        )
    except RuntimeError as exc:
        message = str(exc)
        if "OperationNotSupported" in message or "OpperationNotSupported" in message:
            logger.warning("realtime_translation_webrtc_not_supported", exc_info=exc)
            raise InvalidRequestError(
                "Foundry rejected gpt-realtime-translate WebRTC session creation for this deployment. Use GPT Realtime Translation websockets while the provider WebRTC operation is unavailable."
            ) from exc
        logger.exception("realtime_translation_session_creation_failed")
        raise ExternalServiceError("Realtime translation session creation") from exc
    except Exception as exc:
        logger.exception("realtime_translation_session_creation_failed")
        raise ExternalServiceError("Realtime translation session creation") from exc


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
    language: str = Form("en-US"),
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
        language=language.strip() or "en-US",
    )


router.include_router(websocket_router)
