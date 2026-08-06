import asyncio
import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.concurrency import model_call_semaphore
from app.errors import ExternalServiceError
from app.foundry_client import (
    create_realtime_client_secret,
    load_settings,
    transcribe_audio,
    transcribe_speech_audio,
)
from app.schemas import RealtimeSessionRequest


router = APIRouter(tags=["Voice"])
logger = logging.getLogger(__name__)
MAX_AUDIO_BYTES = 25 * 1024 * 1024


def _invoke(function, /, **kwargs):
    with model_call_semaphore:
        return function(**kwargs)


@router.post("/api/realtime/session")
async def create_realtime_session(request: RealtimeSessionRequest) -> dict:
    try:
        session = await asyncio.to_thread(
            _invoke,
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


@router.post("/api/transcriptions")
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
            result = await asyncio.to_thread(
                _invoke,
                transcribe_speech_audio,
                audio=audio_bytes,
                language=language.strip() or "en-US",
                model=selected_model,
            )
        else:
            result = await asyncio.to_thread(
                _invoke,
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
