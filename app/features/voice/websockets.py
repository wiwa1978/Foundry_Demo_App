import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from websockets.asyncio.client import connect as websocket_connect

from app.concurrency import run_model_call
from app.live_interpreter import LiveInterpreterSession
from app.providers.realtime import create_voice_live_connection_info
from app.providers.settings import load_settings
from app.security import AuthMode, auth_mode, authenticated_user, websocket_origin_allowed
from app.use_case_settings import LIVE_TRANSLATION_USE_CASE, resolve_use_case_binding

router = APIRouter(tags=["Voice"])
logger = logging.getLogger(__name__)
MAX_WEBSOCKET_MESSAGE_BYTES = 1024 * 1024


def _public_provider_error(operation: str, exc: Exception) -> str:
    logger.exception("%s failed", operation, exc_info=exc)
    return f"{operation} failed. Try again later."


async def _authorize_websocket(websocket: WebSocket) -> bool:
    if auth_mode() is not AuthMode.DISABLED and authenticated_user(websocket) is None:
        await websocket.close(code=1008, reason="Sign in with Microsoft Entra ID to use this app.")
        return False
    if not websocket_origin_allowed(websocket):
        await websocket.close(code=1008, reason="WebSocket origin is not allowed.")
        return False
    return True


@router.websocket("/api/voice-live")
async def voice_live_proxy(websocket: WebSocket) -> None:
    if not await _authorize_websocket(websocket):
        return
    await websocket.accept(subprotocol="realtime")
    try:
        connection = await run_model_call(create_voice_live_connection_info)
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
                    "error": {"message": _public_provider_error("Voice Live session", exc)},
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
        binding = resolve_use_case_binding(LIVE_TRANSLATION_USE_CASE)
        if binding is None:
            raise RuntimeError("Map Live translation to a configured Foundry binding first.")
        session = LiveInterpreterSession(
            settings=load_settings(),
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
