import asyncio
import base64
from contextlib import asynccontextmanager
import json
import logging
from pathlib import Path
from typing import Annotated, Any, Callable, TypeVar

from fastapi import APIRouter, Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from websockets.asyncio.client import connect as websocket_connect

from app.config import env_float, load_environment, load_runtime_settings
from app.concurrency import model_call_semaphore

from app.conversation_store import (
    append_message,
    build_model_history,
    conversation_to_dict,
    create_conversation,
    delete_conversation,
    get_conversation,
    get_conversation_messages,
    get_or_create_conversation,
    get_usage_metrics,
    list_conversation_page,
    message_to_dict,
)
from app.document_store import load_rag_search_settings
from app.foundry_admin import (
    DeploymentRequest as FoundryDeploymentRequest,
    admin_config_to_dict,
    create_foundry_deployment,
    get_deployment_guardrail_policy,
    guardrail_policy_exists,
    load_admin_config,
    list_foundry_deployments,
    list_guardrail_policies,
)
from app.foundry_client import (
    create_voice_live_connection_info,
    edit_image,
    generate_image,
    load_settings,
    synthesize_speech,
    transcribe_audio,
)
from app.model_settings import (
    DEPLOYMENT_DEFAULT_GUARDRAIL,
    ModelSettings,
    get_model_settings,
    register_model,
    save_model_settings,
    settings_to_dict,
)
from app.persistence import check_persistence, initialize_persistence
from app.local_auth import (
    AUTH_FLOW_COOKIE,
    AUTH_SESSION_COOKIE,
    complete_auth_flow,
    create_auth_flow,
    decode_cookie,
    encode_cookie,
    is_local_auth_configured,
    user_from_claims,
)
from app.live_interpreter import LiveInterpreterSession
from app.features.document_qa.router import router as document_qa_router
from app.features.voice.router import router as voice_router
from app.features.text_chat.router import router as text_chat_router
from app.observability import (
    audit_event,
    configure_logging,
    request_context_middleware,
    unexpected_error_handler,
)
from app.errors import ApplicationError, ExternalServiceError, application_error_handler
from app.schemas import (
    MAX_PROMPT_LENGTH as MAX_PROMPT_LENGTH,
    AdminDeploymentRequest,
    CompareRequest,
    ImageGenerationRequest,
    ModelRegistrationRequest,
    ModelSettingsRequest,
    normalize_reasoning_effort,
)
from app.security import AuthMode, UserScope, auth_mode, authenticated_user, user_scope, websocket_origin_allowed
from app.services.chat import (
    guardrail_histories as _guardrail_histories,
    guardrail_variants as _guardrail_variants,
    run_and_store_variant as _run_and_store_variant,
)

load_environment()
runtime_settings = load_runtime_settings()
configure_logging(runtime_settings.log_level)

router = APIRouter()
logger = logging.getLogger(__name__)
MAX_AUDIO_BYTES = 25 * 1024 * 1024
MAX_WEBSOCKET_MESSAGE_BYTES = 1024 * 1024
T = TypeVar("T")
PUBLIC_API_PATHS = {
    "/api/auth/me",
    "/api/auth/login",
    "/api/auth/callback",
    "/api/auth/logout",
    "/api/config",
    "/api/health",
    "/api/ready",
}

PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
FRONTEND_INDEX = FRONTEND_DIST / "index.html"

def _is_entra_auth_enabled() -> bool:
    return auth_mode() is not AuthMode.DISABLED


def _authenticated_user_from_request(request: Request | WebSocket) -> dict | None:
    return authenticated_user(request)


def _current_user_scope(request: Request) -> UserScope:
    try:
        return user_scope(request)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Authentication is required.") from exc


async def _run_model_call(function: Callable[..., T], /, *args: Any, **kwargs: Any) -> T:
    return await asyncio.to_thread(_invoke_model_call, function, args, kwargs)


def _invoke_model_call(
    function: Callable[..., T],
    args: tuple[Any, ...],
    kwargs: dict[str, Any],
) -> T:
    with model_call_semaphore:
        return function(*args, **kwargs)


def _upstream_error(operation: str, exc: Exception) -> ExternalServiceError:
    logger.exception("%s failed", operation, exc_info=exc)
    return ExternalServiceError(operation)


def _public_provider_error(operation: str, exc: Exception) -> str:
    logger.exception("%s failed", operation, exc_info=exc)
    return f"{operation} failed. Try again later."


async def require_authenticated_api_user(request: Request, call_next):
    if (
        request.method != "OPTIONS"
        and request.url.path.startswith("/api/")
        and request.url.path not in PUBLIC_API_PATHS
        and _is_entra_auth_enabled()
        and _authenticated_user_from_request(request) is None
    ):
        return JSONResponse(
            status_code=401,
            content={"detail": "Sign in with Microsoft Entra ID to use this app."},
        )
    return await call_next(request)


@router.get("/api/config")
def get_config() -> dict:
    settings = load_settings()
    rag_settings = load_rag_search_settings()
    return {
        "entra_auth_enabled": _is_entra_auth_enabled(),
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


@router.get("/api/health")
def get_health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/api/ready")
def get_readiness() -> JSONResponse:
    try:
        check_persistence()
    except Exception:
        logger.exception("persistence_readiness_failed")
        return JSONResponse(status_code=503, content={"status": "not_ready"})
    return JSONResponse(content={"status": "ready"})


@router.get("/api/auth/me")
def get_authenticated_user(request: Request) -> dict:
    user = _authenticated_user_from_request(request)
    if user is None:
        return {"authenticated": False, "entra_auth_enabled": _is_entra_auth_enabled()}
    return {**user, "entra_auth_enabled": _is_entra_auth_enabled()}


@router.get("/api/auth/login")
def login(request: Request):
    if not is_local_auth_configured():
        return RedirectResponse("/.auth/login/aad?post_login_redirect_uri=/")
    flow = create_auth_flow()
    response = RedirectResponse(flow["auth_uri"])
    response.set_cookie(
        AUTH_FLOW_COOKIE,
        encode_cookie(flow, lifetime_seconds=600),
        max_age=600,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="lax",
    )
    return response


@router.get("/api/auth/callback")
def auth_callback(request: Request):
    flow = decode_cookie(request.cookies.get(AUTH_FLOW_COOKIE))
    if not flow:
        raise HTTPException(status_code=400, detail="The local sign-in session expired. Try again.")
    try:
        claims = complete_auth_flow(flow, dict(request.query_params))
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    response = RedirectResponse("/")
    response.delete_cookie(AUTH_FLOW_COOKIE)
    response.set_cookie(
        AUTH_SESSION_COOKIE,
        encode_cookie(user_from_claims(claims), lifetime_seconds=8 * 60 * 60),
        max_age=8 * 60 * 60,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="lax",
    )
    audit_event("authentication_completed", request=request)
    return response


@router.get("/api/auth/logout")
def logout(request: Request):
    audit_event("logout_requested", request=request)
    if not is_local_auth_configured():
        return RedirectResponse("/.auth/logout?post_logout_redirect_uri=/")
    response = RedirectResponse("/")
    response.delete_cookie(AUTH_SESSION_COOKIE)
    response.delete_cookie(AUTH_FLOW_COOKIE)
    return response


@router.get("/api/model-settings")
def get_settings(model: str) -> dict:
    try:
        return settings_to_dict(get_model_settings(model))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/api/model-settings")
def put_settings(payload: ModelSettingsRequest, request: Request) -> dict:
    if payload.guardrail_policy_names:
        if len(payload.guardrail_policy_names) != 2:
            raise HTTPException(status_code=400, detail="Select two guardrails for comparison.")
        if payload.guardrail_policy_names[0].lower() == payload.guardrail_policy_names[1].lower():
            raise HTTPException(
                status_code=400,
                detail="Select two different guardrails for comparison.",
            )
        try:
            missing_policies = [
                policy_name
                for policy_name in payload.guardrail_policy_names
                if policy_name != DEPLOYMENT_DEFAULT_GUARDRAIL
                and not guardrail_policy_exists(policy_name)
            ]
        except Exception as exc:
            raise _upstream_error("Guardrail policy validation", exc) from exc
        if missing_policies:
            raise HTTPException(
                status_code=400,
                detail="A selected guardrail no longer exists or is not selectable.",
            )
    settings = save_model_settings(
        ModelSettings(
                **{
                    **payload.model_dump(exclude={"guardrail_policy_names"}),
                    "guardrail_policy_names": tuple(payload.guardrail_policy_names),
                }
            )
        )
    audit_event("model_settings_updated", request=request, model=settings.model)
    return settings_to_dict(settings)


@router.get("/api/guardrails/policies")
def get_guardrail_policies() -> dict:
    try:
        return {"policies": list_guardrail_policies()}
    except Exception as exc:
        raise _upstream_error("Guardrail policy discovery", exc) from exc


@router.get("/api/guardrails/deployment-policy")
def get_guardrail_deployment_policy(model: str = Query(min_length=1)) -> dict:
    try:
        return get_deployment_guardrail_policy(model)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise _upstream_error("Deployment policy lookup", exc) from exc


@router.post("/api/models")
def post_model(payload: ModelRegistrationRequest, request: Request) -> dict:
    try:
        settings = register_model(payload.model)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    audit_event("model_registered", request=request, model=settings.model)
    return {
        "models": load_settings().models,
        "settings": settings_to_dict(settings),
    }


@router.get("/api/models")
def get_models() -> dict:
    settings = load_settings()
    configured_models = settings.models
    try:
        deployments = list_foundry_deployments()
    except Exception as exc:
        return {
            "models": configured_models,
            "transcription_models": list(
                dict.fromkeys(
                    model
                    for model in (
                        settings.speech_transcription_model,
                        settings.transcription_model,
                    )
                    if model.strip()
                )
            ),
            "traditional_transcription_models": [settings.transcription_model]
            if settings.transcription_model.strip()
            else [],
            "tts_models": [settings.tts_model] if settings.tts_model.strip() else [],
            "deployments": [],
            "discovery_error": _public_provider_error("Model discovery", exc),
        }

    discovered_models = [deployment["name"] for deployment in deployments]
    models = list(
        dict.fromkeys(
            model
            for model in [*discovered_models, *configured_models]
            if model.strip()
        )
    )
    transcription_models = list(
        dict.fromkeys(
            [
                deployment["name"]
                for deployment in deployments
                if _is_transcription_model(
                    deployment.get("model_name") or deployment["name"]
                )
                or _is_transcription_model(deployment["name"])
            ]
            + [
                model
                for model in (
                    settings.speech_transcription_model,
                    settings.transcription_model,
                )
                if model.strip()
            ]
        )
    )
    traditional_transcription_models = [
        deployment["name"]
        for deployment in deployments
        if _is_transcription_model(deployment.get("model_name") or deployment["name"])
        or _is_transcription_model(deployment["name"])
    ]
    tts_models = [
        deployment["name"]
        for deployment in deployments
        if _is_tts_model(deployment.get("model_name") or deployment["name"])
        or _is_tts_model(deployment["name"])
    ]
    return {
        "models": models,
        "transcription_models": transcription_models,
        "traditional_transcription_models": traditional_transcription_models,
        "tts_models": tts_models,
        "deployments": deployments,
        "model_modalities": {
            model: list(get_model_settings(model).modalities) for model in models
        },
        "discovery_error": None,
    }


def _is_transcription_model(model: str) -> bool:
    normalized_model = model.strip().lower()
    return "transcribe" in normalized_model or "whisper" in normalized_model


def _is_tts_model(model: str) -> bool:
    normalized_model = model.strip().lower()
    return "gpt-audio" in normalized_model or normalized_model in {
        "gpt-4o-mini-tts",
        "tts",
        "tts-hd",
        "tts-1",
        "tts-1-hd",
    }


@router.post("/api/images/generate")
async def post_image_generation(request: ImageGenerationRequest) -> dict:
    configured_for_images = "image" in get_model_settings(request.model).modalities
    if not configured_for_images and not any(
        token in request.model.lower() for token in ("mai-image", "flux")
    ):
        raise HTTPException(
            status_code=400,
            detail=f"{request.model} is not configured with the image capability.",
        )
    try:
        return await _run_model_call(
            generate_image,
            model=request.model,
            prompt=request.prompt,
            width=request.width,
            height=request.height,
        )
    except Exception as exc:
        raise _upstream_error("Image generation", exc) from exc


@router.post("/api/images/edit")
async def post_image_edit(
    image: Annotated[UploadFile, File()],
    model: Annotated[str, Form(min_length=1)],
    prompt: Annotated[str, Form(min_length=1)],
    width: Annotated[int, Form(ge=768)] = 1024,
    height: Annotated[int, Form(ge=768)] = 1024,
) -> dict:
    model = model.strip()
    prompt = prompt.strip()
    if not model or not prompt:
        raise HTTPException(status_code=400, detail="Model and prompt cannot be blank.")
    if width * height > 1_048_576:
        raise HTTPException(
            status_code=400,
            detail="Image dimensions cannot exceed 1,048,576 total pixels.",
        )
    if "gpt-image" not in model.lower():
        raise HTTPException(
            status_code=400,
            detail=f"{model} does not support image editing.",
        )
    supported_types = {"image/png", "image/jpeg", "image/webp"}
    if image.content_type not in supported_types:
        raise HTTPException(
            status_code=400,
            detail="Source image must be a PNG, JPEG, or WebP file.",
        )
    image_bytes = await image.read(10 * 1024 * 1024 + 1)
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Source image cannot be empty.")
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Source image cannot exceed 10 MB.")
    try:
        return await _run_model_call(
            edit_image,
            model=model,
            prompt=prompt,
            image=image_bytes,
            image_content_type=image.content_type,
            width=width,
            height=height,
        )
    except Exception as exc:
        raise _upstream_error("Image editing", exc) from exc


@router.post("/api/voice/traditional")
async def post_traditional_voice(
    scope: Annotated[UserScope, Depends(_current_user_scope)],
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
    normalized_reasoning_effort = _normalize_reasoning_effort(reasoning_effort)
    audio_bytes = await audio.read(MAX_AUDIO_BYTES + 1)
    if not audio_bytes:
        raise HTTPException(status_code=422, detail="Recorded audio was empty.")
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Recorded audio cannot exceed 25 MB.")

    try:
        transcription = await _run_model_call(
            transcribe_audio,
            audio=audio_bytes,
            filename=audio.filename or "recording.webm",
            content_type=audio.content_type,
            model=transcription_model,
        )
        transcript = transcription["text"].strip()
        if not transcript:
            raise RuntimeError("Foundry transcription did not return any text.")

        conversation = get_or_create_conversation(scope, conversation_id, transcript, use_case)
        model_settings = get_model_settings(model)
        variants = _guardrail_variants(model_settings, False)
        histories = _guardrail_histories(scope, conversation.id, model, variants)
        user_message = append_message(
            scope=scope,
            conversation_id=conversation.id,
            role="user",
            content=transcript,
        )
        variant_results = await asyncio.gather(
            *(
                asyncio.to_thread(
                    _run_and_store_variant,
                    scope=scope,
                    conversation_id=conversation.id,
                    model_settings=model_settings,
                    prompt=transcript,
                    system_prompt=model_settings.system_prompt,
                    reasoning_effort=normalized_reasoning_effort,
                    history=histories[variant],
                    variant=variant,
                    policy_name=policy_name,
                )
                for variant, policy_name in variants
            )
        )

        async def add_speech(result: dict[str, Any]) -> dict[str, Any]:
            if result.get("error") or not result.get("content"):
                return result
            try:
                speech = await _run_model_call(
                    synthesize_speech,
                    text=result["content"],
                    model=tts_model,
                    voice=tts_voice,
                )
            except Exception as exc:
                return {**result, "speech_error": _public_provider_error("Speech synthesis", exc)}
            return {
                **result,
                "speech": {
                    **{key: value for key, value in speech.items() if key != "audio"},
                    "audio_base64": base64.b64encode(speech["audio"]).decode("ascii"),
                },
            }

        results_with_speech = await asyncio.gather(
            *(add_speech(result) for result in variant_results)
        )

        payload = {
            "model": model,
            "transcription": transcription,
            "results": results_with_speech,
            "conversation": conversation_to_dict(
                get_conversation(scope, conversation.id) or conversation
            ),
            "user_message": message_to_dict(user_message),
        }
        if len(results_with_speech) == 1:
            result = results_with_speech[0]
            payload.update(result)
            payload["chat"] = {
                key: value
                for key, value in result.items()
                if key not in {"assistant_message", "speech"}
            }
        return payload
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise _upstream_error("Traditional voice processing", exc) from exc


@router.websocket("/api/voice-live")
async def voice_live_proxy(websocket: WebSocket) -> None:
    if _is_entra_auth_enabled() and _authenticated_user_from_request(websocket) is None:
        await websocket.close(code=1008, reason="Sign in with Microsoft Entra ID to use this app.")
        return
    if not websocket_origin_allowed(websocket):
        await websocket.close(code=1008, reason="WebSocket origin is not allowed.")
        return
    await websocket.accept(subprotocol="realtime")
    try:
        connection = await _run_model_call(create_voice_live_connection_info)
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
    if _is_entra_auth_enabled() and _authenticated_user_from_request(websocket) is None:
        await websocket.close(code=1008, reason="Sign in with Microsoft Entra ID to use this app.")
        return
    if not websocket_origin_allowed(websocket):
        await websocket.close(code=1008, reason="WebSocket origin is not allowed.")
        return
    await websocket.accept()
    session: LiveInterpreterSession | None = None
    sender: asyncio.Task | None = None
    try:
        start_message = await websocket.receive_json()
        if start_message.get("type") != "start":
            raise ValueError("The first message must start a Live Interpreter session.")
        session = LiveInterpreterSession(
            settings=load_settings(),
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
                control = json.loads(message["text"])
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


@router.get("/api/conversations")
def get_conversations(
    scope: Annotated[UserScope, Depends(_current_user_scope)],
    use_case: str = Query("text_chat"),
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    cursor: str | None = None,
) -> dict:
    try:
        page = list_conversation_page(
            scope,
            use_case=use_case,
            limit=limit,
            cursor=cursor,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "conversations": [conversation_to_dict(item) for item in page.conversations],
        "next_cursor": page.next_cursor,
    }


@router.post("/api/conversations")
def post_conversation(
    scope: Annotated[UserScope, Depends(_current_user_scope)],
    use_case: str = Query("text_chat"),
) -> dict:
    conversation = create_conversation(scope, use_case=use_case)
    return {"conversation": conversation_to_dict(conversation), "messages": []}


@router.get("/api/conversations/{conversation_id}")
def get_conversation_by_id(
    conversation_id: str,
    scope: Annotated[UserScope, Depends(_current_user_scope)],
    use_case: str = Query("text_chat"),
) -> dict:
    conversation = get_conversation(scope, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    if conversation.use_case != use_case:
        raise HTTPException(status_code=404, detail="Conversation not found for this use case.")
    messages = get_conversation_messages(scope, conversation_id)
    return {
        "conversation": conversation_to_dict(conversation),
        "messages": [message_to_dict(message) for message in messages],
    }


@router.delete("/api/conversations/{conversation_id}")
def delete_conversation_by_id(
    conversation_id: str,
    scope: Annotated[UserScope, Depends(_current_user_scope)],
    request: Request,
) -> dict:
    if not delete_conversation(scope, conversation_id):
        raise HTTPException(status_code=404, detail="Conversation not found.")
    audit_event("conversation_deleted", request=request, conversation_id=conversation_id)
    return {"deleted": True}


@router.get("/api/metrics/model")
def get_model_usage_metrics(
    scope: Annotated[UserScope, Depends(_current_user_scope)],
    days: Annotated[int, Query(ge=1, le=31)] = 7,
    model: str | None = None,
) -> dict:
    normalized_model = model.strip() if model else None
    return get_usage_metrics(
        scope=scope,
        days=days,
        model=normalized_model or None,
        input_token_cost_per_1k=_env_float("FOUNDRY_INPUT_TOKEN_COST_PER_1K"),
        output_token_cost_per_1k=_env_float("FOUNDRY_OUTPUT_TOKEN_COST_PER_1K"),
    )


@router.get("/api/admin/deployments/config")
def get_admin_deployment_config() -> dict:
    return admin_config_to_dict(load_admin_config())


@router.post("/api/admin/deployments")
async def post_admin_deployment(payload: AdminDeploymentRequest, request: Request) -> dict:
    try:
        deployment = await _run_model_call(
            create_foundry_deployment,
            FoundryDeploymentRequest(
                deployment_name=payload.deployment_name,
                model_name=payload.model_name,
                model_version=payload.model_version,
                model_format=payload.model_format,
                sku_name=payload.sku_name,
                sku_capacity=payload.sku_capacity,
                version_upgrade_option=payload.version_upgrade_option,
                rai_policy_name=payload.rai_policy_name,
                wait_for_completion=payload.wait_for_completion,
            ),
        )
        settings = save_model_settings(
            ModelSettings(
                model=payload.deployment_name,
                api_surface=payload.api_surface,
                modalities=tuple(payload.modalities),
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise _upstream_error("Model deployment", exc) from exc

    audit_event("model_deployment_created", request=request, model=settings.model)
    return {
        "deployment": deployment,
        "settings": settings_to_dict(settings),
    }


@router.post("/api/compare")
async def compare(
    request: CompareRequest,
    scope: Annotated[UserScope, Depends(_current_user_scope)],
) -> dict:
    try:
        conversation = get_or_create_conversation(
            scope, request.conversation_id, request.prompt, request.use_case
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    model_settings_by_name = {
        model: get_model_settings(model) for model in request.models
    }
    variants_by_model = {
        model: _guardrail_variants(model_settings, False)
        for model, model_settings in model_settings_by_name.items()
    }
    histories = {
        (model, variant): build_model_history(
            scope,
            conversation.id,
            model,
            variant,
            policy_name,
        )
        for model, variants in variants_by_model.items()
        for variant, policy_name in variants
    }
    user_message = append_message(
        scope=scope,
        conversation_id=conversation.id,
        role="user",
        content=request.prompt,
    )

    async def run_model(model: str) -> dict:
        model_settings = model_settings_by_name[model]
        variant_results = await asyncio.gather(
            *(
                asyncio.to_thread(
                    _run_and_store_variant,
                    scope=scope,
                    conversation_id=conversation.id,
                    model_settings=model_settings,
                    prompt=request.prompt,
                    system_prompt=model_settings.system_prompt,
                    reasoning_effort=request.reasoning_effort,
                    history=histories[(model, variant)],
                    variant=variant,
                    policy_name=policy_name,
                )
                for variant, policy_name in variants_by_model[model]
            )
        )
        if len(variant_results) == 1:
            return variant_results[0]
        return {
            "model": model,
            "guardrail_comparison": True,
            "guardrail_policy_names": list(model_settings.guardrail_policy_names),
            "variants": variant_results,
        }

    results = await asyncio.gather(*(run_model(model) for model in request.models))
    return {
        "conversation": conversation_to_dict(
            get_conversation(scope, conversation.id) or conversation
        ),
        "user_message": message_to_dict(user_message),
        "results": results,
    }


@router.get("/")
def index() -> FileResponse:
    if FRONTEND_INDEX.exists():
        return FileResponse(FRONTEND_INDEX)
    raise HTTPException(
        status_code=404,
        detail="Frontend build not found. Run npm install and npm run build in the frontend folder.",
    )


@router.get("/favicon.svg")
def favicon() -> FileResponse:
    favicon_path = FRONTEND_DIST / "favicon.svg"
    if favicon_path.exists():
        return FileResponse(favicon_path, media_type="image/svg+xml")
    raise HTTPException(status_code=404, detail="Favicon not found.")


@router.get("/{full_path:path}")
def spa_fallback(full_path: str) -> FileResponse:
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found.")
    if FRONTEND_INDEX.exists():
        return FileResponse(FRONTEND_INDEX)
    raise HTTPException(status_code=404, detail="Frontend build not found.")


def _normalize_reasoning_effort(value: str | None) -> str | None:
    return normalize_reasoning_effort(value)


def _env_float(name: str) -> float:
    return env_float(name, minimum=0)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize_persistence()
    logger.info("application_started persistence_ready=true")
    yield


def create_app() -> FastAPI:
    application = FastAPI(title="Foundry Chat App", lifespan=lifespan)
    if (FRONTEND_DIST / "assets").exists():
        application.mount(
            "/assets",
            StaticFiles(directory=FRONTEND_DIST / "assets"),
            name="assets",
        )
    application.middleware("http")(require_authenticated_api_user)
    application.middleware("http")(request_context_middleware)
    application.add_exception_handler(ApplicationError, application_error_handler)
    application.add_exception_handler(Exception, unexpected_error_handler)
    application.include_router(text_chat_router)
    application.include_router(document_qa_router)
    application.include_router(voice_router)
    application.include_router(router)
    return application


app = create_app()
