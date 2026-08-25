import asyncio
import base64
import json
import logging
import math
import struct
from collections import deque
from dataclasses import dataclass, field
from typing import Any, cast

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from websockets.asyncio.client import connect as websocket_connect
from websockets.exceptions import InvalidStatus

from app.api.security import AuthMode, auth_mode, authenticated_user, websocket_origin_allowed
from app.application.use_case_settings import LIVE_TRANSLATION_USE_CASE, FoundryBinding
from app.core.concurrency import run_model_call
from app.infrastructure.azure.foundry.realtime import (
    create_realtime_transcription_connection_info,
    create_realtime_translation_connection_info,
    create_voice_live_connection_info,
    create_voice_live_avatar_connection_info,
)
from app.infrastructure.azure.foundry.settings import load_settings
from usecases_media.shared.voice.backend.live_interpreter import LiveInterpreterSession

router = APIRouter(tags=["Voice"])
logger = logging.getLogger(__name__)
MAX_WEBSOCKET_MESSAGE_BYTES = 1024 * 1024
PCM_SAMPLE_RATE = 24000
PCM_BYTES_PER_SAMPLE = 2
MIN_AUDIO_RMS = 0.01
MIN_COMMIT_AUDIO_BYTES = PCM_SAMPLE_RATE * PCM_BYTES_PER_SAMPLE // 2
MAX_COMMIT_AUDIO_BYTES = PCM_SAMPLE_RATE * PCM_BYTES_PER_SAMPLE * 12
SILENCE_COMMIT_SECONDS = 0.9
STOP_DRAIN_SECONDS = 2.2
SUPPORTED_DELAYS = {"minimal", "low", "medium", "high", "xhigh"}
SUPPORTED_TURN_DETECTION = {"none", "server_vad", "semantic_vad"}
MAX_MODEL_NAME_LENGTH = 200


@dataclass
class TranscriptionProxyState:
    uncommitted_audio_bytes: int = 0
    uncommitted_has_speech: bool = False
    silent_audio_seconds: float = 0
    next_sequence: int = 1
    pending_sequences: deque[int] = field(default_factory=deque)
    pending_items: set[str] = field(default_factory=set)
    item_sequences: dict[str, int] = field(default_factory=dict)
    finalization_event: asyncio.Event = field(default_factory=asyncio.Event)
    send_lock: asyncio.Lock = field(default_factory=asyncio.Lock)


def _pcm16_rms(audio: bytes) -> float:
    sample_count = len(audio) // PCM_BYTES_PER_SAMPLE
    if not sample_count:
        return 0
    samples = struct.unpack(f"<{sample_count}h", audio[: sample_count * 2])
    return math.sqrt(sum(sample * sample for sample in samples) / sample_count) / 32768


def _transcription_options(
    websocket: WebSocket,
) -> tuple[str | None, str | None, str | None, str]:
    model = websocket.query_params.get("model") or None
    language = websocket.query_params.get("language") or None
    delay = websocket.query_params.get("delay") or None
    turn_detection = websocket.query_params.get("turnDetection", "none").lower()
    if model:
        model = model.strip() or None
        if model and len(model) > MAX_MODEL_NAME_LENGTH:
            raise ValueError("Realtime transcription model name is too long.")
    if language and (len(language) != 2 or not language.isalpha()):
        raise ValueError("Language must be an ISO-639-1 code.")
    if delay and delay not in SUPPORTED_DELAYS:
        raise ValueError("Unsupported transcription delay.")
    if turn_detection not in SUPPORTED_TURN_DETECTION:
        raise ValueError("Unsupported turn detection mode.")
    return model, language, delay, turn_detection


def _assign_sequence(state: TranscriptionProxyState, item_id: str | None) -> int | None:
    if not item_id:
        return None
    if item_id in state.item_sequences:
        return state.item_sequences[item_id]
    sequence = state.pending_sequences.popleft() if state.pending_sequences else state.next_sequence
    if sequence == state.next_sequence:
        state.next_sequence += 1
    state.item_sequences[item_id] = sequence
    return sequence


async def _commit_transcription_audio(
    upstream: Any,
    state: TranscriptionProxyState,
    *,
    force: bool = False,
) -> bool:
    async with state.send_lock:
        if (
            not state.uncommitted_has_speech
            or not state.uncommitted_audio_bytes
            or (not force and state.uncommitted_audio_bytes < MIN_COMMIT_AUDIO_BYTES)
        ):
            return False
        await upstream.send(json.dumps({"type": "input_audio_buffer.commit"}))
        state.pending_sequences.append(state.next_sequence)
        state.next_sequence += 1
        state.uncommitted_audio_bytes = 0
        state.uncommitted_has_speech = False
        state.silent_audio_seconds = 0
        state.finalization_event.set()
        return True


async def _wait_for_transcription_finalization(state: TranscriptionProxyState) -> None:
    loop = asyncio.get_running_loop()
    deadline = loop.time() + STOP_DRAIN_SECONDS
    while state.pending_sequences or state.pending_items:
        remaining = deadline - loop.time()
        if remaining <= 0:
            return
        state.finalization_event.clear()
        if not state.pending_sequences and not state.pending_items:
            return
        try:
            await asyncio.wait_for(state.finalization_event.wait(), timeout=remaining)
        except TimeoutError:
            return


def _public_provider_error(operation: str, exc: Exception) -> str:
    logger.exception("%s failed", operation, exc_info=exc)
    if isinstance(exc, InvalidStatus):
        return (
            f"{operation} failed: Azure rejected the WebSocket endpoint "
            f"with HTTP {exc.response.status_code}. Check the Voice Live endpoint, "
            "API version, and model deployment."
        )
    return f"{operation} failed. Try again later."


async def _authorize_websocket(websocket: WebSocket) -> bool:
    if auth_mode() is not AuthMode.DISABLED and authenticated_user(websocket) is None:
        await websocket.close(code=1008, reason="Sign in with Microsoft Entra ID to use this app.")
        return False
    if not websocket_origin_allowed(websocket):
        await websocket.close(code=1008, reason="WebSocket origin is not allowed.")
        return False
    return True


async def _voice_live_proxy(
    websocket: WebSocket,
    connection_factory,
    operation: str,
) -> None:
    if not await _authorize_websocket(websocket):
        return
    await websocket.accept(subprotocol="realtime")
    try:
        connection = await run_model_call(connection_factory)
        async with websocket_connect(
            connection["url"],
            additional_headers={"Authorization": f"Bearer {connection['token']}"},
            subprotocols=["realtime"],
        ) as upstream:

            async def relay_to_service() -> None:
                while True:
                    message = await websocket.receive()
                    if message["type"] == "websocket.disconnect":
                        return
                    if message.get("text") is not None:
                        if len(message["text"].encode("utf-8")) > MAX_WEBSOCKET_MESSAGE_BYTES:
                            raise ValueError("WebSocket message is too large.")
                        await upstream.send(message["text"])
                    elif message.get("bytes") is not None:
                        if len(message["bytes"]) > MAX_WEBSOCKET_MESSAGE_BYTES:
                            raise ValueError("WebSocket message is too large.")
                        await upstream.send(message["bytes"])

            async def relay_to_browser() -> None:
                async for message in upstream:
                    if isinstance(message, bytes):
                        await websocket.send_bytes(message)
                    else:
                        await websocket.send_text(message)

            tasks = {
                asyncio.create_task(relay_to_service()),
                asyncio.create_task(relay_to_browser()),
            }
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            for task in done:
                task.result()
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await websocket.send_json(
                {
                    "type": "error",
                    "error": {"message": _public_provider_error(operation, exc)},
                }
            )
            await websocket.close(code=1011)
        except RuntimeError:
            pass


@router.websocket("/api/voice-live")
async def voice_live_proxy(websocket: WebSocket) -> None:
    await _voice_live_proxy(
        websocket,
        create_voice_live_connection_info,
        "Voice Live session",
    )


@router.websocket("/api/voice-live-avatar")
async def voice_live_avatar_proxy(websocket: WebSocket) -> None:
    await _voice_live_proxy(
        websocket,
        create_voice_live_avatar_connection_info,
        "Voice Live avatar session",
    )

@router.websocket("/api/realtime-transcription")
async def realtime_transcription_proxy(websocket: WebSocket) -> None:
    if not await _authorize_websocket(websocket):
        return
    await websocket.accept()
    state = TranscriptionProxyState()
    try:
        model, language, delay, turn_detection = _transcription_options(websocket)
        connection = await run_model_call(
            create_realtime_transcription_connection_info,
            model=model,
            language=language,
            delay=delay,
            turn_detection=turn_detection,
        )
        async with websocket_connect(
            connection["url"],
            additional_headers={"Authorization": f"Bearer {connection['token']}"},
            max_size=None,
        ) as upstream:
            await upstream.send(json.dumps(connection["session_update"]))
            await websocket.send_json(
                {"type": "ready", "model": connection["model"], "input_rate": 24000}
            )

            async def relay_audio_to_service() -> None:
                while True:
                    message = await websocket.receive()
                    if message["type"] == "websocket.disconnect":
                        return
                    audio = message.get("bytes")
                    if audio is not None:
                        if len(audio) > MAX_WEBSOCKET_MESSAGE_BYTES:
                            raise ValueError("WebSocket message is too large.")
                        rms = _pcm16_rms(audio)
                        low_energy = rms < MIN_AUDIO_RMS
                        if turn_detection == "none" and low_energy:
                            state.silent_audio_seconds += len(audio) / (
                                PCM_SAMPLE_RATE * PCM_BYTES_PER_SAMPLE
                            )
                            if not state.uncommitted_has_speech:
                                continue
                        async with state.send_lock:
                            await upstream.send(
                                json.dumps(
                                    {
                                        "type": "input_audio_buffer.append",
                                        "audio": base64.b64encode(audio).decode("ascii"),
                                    }
                                )
                            )
                            if turn_detection == "none":
                                state.uncommitted_audio_bytes += len(audio)
                                if not low_energy:
                                    state.uncommitted_has_speech = True
                                    state.silent_audio_seconds = 0
                        if turn_detection == "none" and (
                            (
                                state.uncommitted_audio_bytes >= MIN_COMMIT_AUDIO_BYTES
                                and state.silent_audio_seconds >= SILENCE_COMMIT_SECONDS
                            )
                            or state.uncommitted_audio_bytes >= MAX_COMMIT_AUDIO_BYTES
                        ):
                            await _commit_transcription_audio(upstream, state)
                        continue
                    text = message.get("text")
                    if text:
                        if len(text.encode("utf-8")) > MAX_WEBSOCKET_MESSAGE_BYTES:
                            raise ValueError("WebSocket message is too large.")
                        control = json.loads(text)
                        if control.get("type") == "stop":
                            if turn_detection == "none":
                                await _commit_transcription_audio(upstream, state, force=True)
                                await _wait_for_transcription_finalization(state)
                            return
                        if control.get("type") == "commit" and turn_detection == "none":
                            await _commit_transcription_audio(upstream, state)
                            continue
                        raise ValueError("Unsupported realtime transcription control event.")

            async def relay_transcripts_to_browser() -> None:
                async for message in upstream:
                    if isinstance(message, bytes):
                        continue
                    event = json.loads(message)
                    event_type = event.get("type")
                    item_id = event.get("item_id")
                    if event_type == "input_audio_buffer.committed":
                        sequence = _assign_sequence(state, item_id)
                        if item_id:
                            state.pending_items.add(item_id)
                            state.finalization_event.set()
                        await websocket.send_json(
                            {"type": "audio.committed", "item_id": item_id, "sequence": sequence}
                        )
                        continue
                    if event_type in {
                        "conversation.item.input_audio_transcription.delta",
                        "conversation.item.input_audio_transcription.completed",
                    }:
                        event["sequence"] = _assign_sequence(state, item_id)
                        if item_id:
                            if event_type.endswith(".completed"):
                                state.pending_items.discard(item_id)
                            else:
                                state.pending_items.add(item_id)
                            state.finalization_event.set()
                    if event_type in {
                        "conversation.item.input_audio_transcription.delta",
                        "conversation.item.input_audio_transcription.completed",
                        "input_audio_buffer.speech_started",
                        "input_audio_buffer.speech_stopped",
                        "error",
                    }:
                        await websocket.send_json(event)

            tasks = {
                asyncio.create_task(relay_audio_to_service()),
                asyncio.create_task(relay_transcripts_to_browser()),
            }
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            for task in done:
                task.result()
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await websocket.send_json(
                {
                    "type": "error",
                    "error": {
                        "message": _public_provider_error("Realtime transcription session", exc)
                    },
                }
            )
            await websocket.close(code=1011)
        except RuntimeError:
            pass


@router.websocket("/api/realtime-translation")
async def realtime_translation_proxy(websocket: WebSocket) -> None:
    if not await _authorize_websocket(websocket):
        return
    await websocket.accept()
    session_closed = asyncio.Event()
    try:
        target_language = websocket.query_params.get("targetLanguage", "fr")
        source_language = websocket.query_params.get("sourceLanguage") or None
        model = websocket.query_params.get("model") or None
        transcription_model = websocket.query_params.get("transcriptionModel") or None
        connection = await run_model_call(
            create_realtime_translation_connection_info,
            target_language=target_language,
            source_language=source_language,
            model=model,
            transcription_model=transcription_model,
        )
        async with websocket_connect(
            connection["url"],
            additional_headers={
                "Authorization": f"Bearer {connection['token']}",
                "openai-alpha": "translation=v1",
            },
            max_size=None,
        ) as upstream:
            await upstream.send(json.dumps(connection["session_update"]))

            async def read_upstream_event() -> dict[str, Any]:
                while True:
                    message = await upstream.recv()
                    if isinstance(message, bytes):
                        continue
                    return cast(dict[str, Any], json.loads(message))

            while True:
                event = await asyncio.wait_for(read_upstream_event(), timeout=15)
                event_type = event.get("type")
                if event_type == "error":
                    error = event.get("error")
                    message = (
                        error.get("message")
                        if isinstance(error, dict)
                        else "Realtime translation session configuration failed."
                    )
                    raise RuntimeError(str(message))
                if event_type == "session.created":
                    await websocket.send_json(event)
                    continue
                if event_type == "session.updated":
                    break

            await websocket.send_json(
                {
                    "type": "ready",
                    "model": connection["model"],
                    "transcription_model": connection["transcription_model"],
                    "input_rate": 24000,
                }
            )

            async def relay_audio_to_service() -> None:
                while True:
                    message = await websocket.receive()
                    if message["type"] == "websocket.disconnect":
                        await upstream.send(json.dumps({"type": "session.close"}))
                        try:
                            await asyncio.wait_for(session_closed.wait(), timeout=20)
                        except TimeoutError:
                            pass
                        return
                    audio = message.get("bytes")
                    if audio is not None:
                        if len(audio) > MAX_WEBSOCKET_MESSAGE_BYTES:
                            raise ValueError("WebSocket message is too large.")
                        await upstream.send(
                            json.dumps(
                                {
                                    "type": "session.input_audio_buffer.append",
                                    "audio": base64.b64encode(audio).decode("ascii"),
                                }
                            )
                        )
                        continue
                    text = message.get("text")
                    if text:
                        if len(text.encode("utf-8")) > MAX_WEBSOCKET_MESSAGE_BYTES:
                            raise ValueError("WebSocket message is too large.")
                        control = json.loads(text)
                        if control.get("type") != "stop":
                            raise ValueError("Unsupported realtime translation control event.")
                        await upstream.send(json.dumps({"type": "session.close"}))
                        await asyncio.wait_for(session_closed.wait(), timeout=20)
                        return

            async def relay_translation_to_browser() -> None:
                while True:
                    event = await read_upstream_event()
                    event_type = event.get("type")
                    if event_type == "session.closed":
                        session_closed.set()
                    if event_type in {
                        "session.created",
                        "session.updated",
                        "session.closed",
                        "error",
                        "session.input_transcript.delta",
                        "session.input_transcript.completed",
                        "session.input_transcript.done",
                        "session.output_transcript.delta",
                        "session.output_transcript.completed",
                        "session.output_transcript.done",
                        "session.output_audio.delta",
                        "response.text.delta",
                        "response.text.done",
                        "response.audio.delta",
                        "response.audio.done",
                        "response.audio_transcript.delta",
                        "response.output_audio.delta",
                        "response.output_audio.done",
                        "response.output_audio_transcript.delta",
                        "conversation.item.input_audio_transcription.delta",
                        "conversation.item.input_audio_transcription.completed",
                        "conversation.item.input_audio_transcription.failed",
                        "transcript.delta",
                        "transcript.completed",
                        "transcript.done",
                        "translation.delta",
                        "translation.completed",
                        "translation.done",
                    }:
                        await websocket.send_json(event)

            tasks = {
                asyncio.create_task(relay_audio_to_service()),
                asyncio.create_task(relay_translation_to_browser()),
            }
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            if session_closed.is_set():
                await websocket.close(code=1000, reason="Realtime translation ended.")
            for task in pending:
                task.cancel()
            for task in done:
                task.result()
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await websocket.send_json(
                {
                    "type": "error",
                    "error": {
                        "message": _public_provider_error("Realtime translation session", exc)
                    },
                }
            )
            await websocket.close(code=1011)
        except RuntimeError:
            pass


@router.websocket("/api/live-interpreter")
async def live_interpreter(websocket: WebSocket) -> None:
    if not await _authorize_websocket(websocket):
        return
    await websocket.accept()
    session: LiveInterpreterSession | None = None
    sender: asyncio.Task[None] | None = None
    try:
        start_message = await websocket.receive_json()
        if start_message.get("type") != "start":
            raise ValueError("The first message must start a Live Interpreter session.")
        services = websocket.app.state.services
        binding = services.use_case_settings.resolve(LIVE_TRANSLATION_USE_CASE)
        settings = load_settings(
            services.models.list(),
            live_interpreter_configured=binding is not None,
        )
        if binding is None:
            if not settings.speech_endpoint:
                raise RuntimeError(
                    "Set AZURE_SPEECH_ENDPOINT or map Live translation to a configured Speech binding."
                )
            binding = FoundryBinding(
                name="DEFAULT",
                project_endpoint=settings.endpoint or "",
                models=tuple(settings.models),
                speech_key=settings.speech_key,
                speech_endpoint=settings.speech_endpoint,
                region=None,
            )
        session = LiveInterpreterSession(

            binding=binding,
            mode=str(start_message.get("mode", "standard")),
            source_language=str(start_message.get("source_language", "")),
            target_language=str(start_message.get("target_language", "")),
            loop=asyncio.get_running_loop(),
        )
        await session.start()
        await websocket.send_json(
            {
                "type": "ready",
                "input_format": "pcm_s16le_16000_mono",
                "output_format": "pcm_s16le_16000_mono",
            }
        )

        async def send_events() -> None:
            while True:
                kind, payload = await session.events.get()
                if kind == "bytes":
                    await websocket.send_bytes(payload)
                else:
                    await websocket.send_json(payload)

        sender = asyncio.create_task(send_events())
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            if message.get("bytes") is not None:
                if len(message["bytes"]) > MAX_WEBSOCKET_MESSAGE_BYTES:
                    raise ValueError("WebSocket message is too large.")
                session.write(message["bytes"])
            elif message.get("text"):
                if len(message["text"].encode("utf-8")) > MAX_WEBSOCKET_MESSAGE_BYTES:
                    raise ValueError("WebSocket message is too large.")
                control: dict[str, Any] = json.loads(message["text"])
                if control.get("type") == "stop":
                    break
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await websocket.send_json(
                {"type": "error", "error": _public_provider_error("Live Interpreter", exc)}
            )
            await websocket.close(code=1011)
        except RuntimeError:
            pass
    finally:
        if sender:
            sender.cancel()
        if session:
            await session.close()
