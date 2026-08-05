import asyncio
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
from pathlib import Path
from typing import Annotated, Any

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator, model_validator

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
    initialize_conversation_database,
    list_conversations,
    message_to_dict,
)
from app.document_store import (
    build_grounded_prompt,
    build_rag_system_prompt,
    chunk_to_dict,
    delete_document,
    document_to_dict,
    add_document,
    list_documents as list_rag_documents,
    load_rag_search_settings,
    retrieve_document_chunks,
)
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
    build_foundry_request_trace,
    complete_chat,
    create_realtime_client_secret,
    edit_image,
    generate_image,
    load_settings,
    stream_chat,
    synthesize_speech,
    transcribe_audio,
    transcribe_speech_audio,
)
from app.model_settings import (
    DEPLOYMENT_DEFAULT_GUARDRAIL,
    MODEL_MODALITIES,
    ModelSettings,
    get_model_settings,
    initialize_database,
    register_model,
    save_model_settings,
    settings_to_dict,
)
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

load_dotenv()

app = FastAPI(title="Foundry Chat App")
REASONING_EFFORTS = {"none", "minimal", "low", "medium", "high", "xhigh"}
PUBLIC_API_PATHS = {
    "/api/auth/me",
    "/api/auth/login",
    "/api/auth/callback",
    "/api/auth/logout",
    "/api/config",
}

PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
FRONTEND_INDEX = FRONTEND_DIST / "index.html"

if (FRONTEND_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")


def _is_entra_auth_enabled() -> bool:
    return is_local_auth_configured() or os.getenv("ENTRA_AUTH_ENABLED", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }


def _decode_client_principal(request: Request) -> dict | None:
    encoded_principal = request.headers.get("x-ms-client-principal")
    if not encoded_principal:
        return None
    try:
        decoded = base64.b64decode(encoded_principal).decode("utf-8")
        principal = json.loads(decoded)
    except (ValueError, json.JSONDecodeError):
        return None
    return principal if isinstance(principal, dict) else None


def _authenticated_user_from_request(request: Request) -> dict | None:
    local_user = decode_cookie(request.cookies.get(AUTH_SESSION_COOKIE)) if is_local_auth_configured() else None
    if local_user:
        return {key: value for key, value in local_user.items() if key != "exp"}
    principal = _decode_client_principal(request)
    user_name = request.headers.get("x-ms-client-principal-name")
    user_id = request.headers.get("x-ms-client-principal-id")
    provider = request.headers.get("x-ms-client-principal-idp")
    if principal:
        claims = principal.get("claims") if isinstance(principal.get("claims"), list) else []
        claim_lookup = {
            str(claim.get("typ")): str(claim.get("val"))
            for claim in claims
            if isinstance(claim, dict) and claim.get("typ") and claim.get("val")
        }
        return {
            "authenticated": True,
            "name": principal.get("userDetails") or user_name,
            "user_id": principal.get("userId") or user_id,
            "identity_provider": principal.get("identityProvider") or provider,
            "email": claim_lookup.get("preferred_username")
            or claim_lookup.get("email")
            or user_name,
        }
    if user_name or user_id:
        return {
            "authenticated": True,
            "name": user_name,
            "user_id": user_id,
            "identity_provider": provider,
            "email": user_name,
        }
    return None


@app.middleware("http")
async def require_authenticated_api_user(request: Request, call_next):
    if (
        _is_entra_auth_enabled()
        and request.method != "OPTIONS"
        and request.url.path.startswith("/api/")
        and request.url.path not in PUBLIC_API_PATHS
        and _authenticated_user_from_request(request) is None
    ):
        return JSONResponse(
            status_code=401,
            content={"detail": "Sign in with Microsoft Entra ID to use this app."},
        )
    return await call_next(request)


@app.on_event("startup")
def startup() -> None:
    initialize_database()
    initialize_conversation_database()


class ChatRequest(BaseModel):
    model: str = Field(min_length=1)
    prompt: str = Field(min_length=1)
    conversation_id: str | None = None
    reasoning_effort: str | None = None
    guardrail_comparison: bool = False
    use_case: str = "text_chat"

    @field_validator("model", "prompt")
    @classmethod
    def trim_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value cannot be blank.")
        return value

    @field_validator("reasoning_effort")
    @classmethod
    def normalize_reasoning_effort(cls, value: str | None) -> str | None:
        return _normalize_reasoning_effort(value)


class DocumentQuestionRequest(BaseModel):
    model: str = Field(min_length=1)
    prompt: str = Field(min_length=1)
    conversation_id: str | None = None
    reasoning_effort: str | None = None
    guardrail_comparison: bool = False
    use_case: str = "document_qa"

    @field_validator("model", "prompt")
    @classmethod
    def trim_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value cannot be blank.")
        return value

    @field_validator("reasoning_effort")
    @classmethod
    def normalize_reasoning_effort(cls, value: str | None) -> str | None:
        return _normalize_reasoning_effort(value)


class CompareRequest(BaseModel):
    models: list[str] = Field(min_length=1, max_length=12)
    prompt: str = Field(min_length=1)
    conversation_id: str | None = None
    reasoning_effort: str | None = None
    use_case: str = "comparison"

    @field_validator("models")
    @classmethod
    def normalize_models(cls, value: list[str]) -> list[str]:
        models = list(dict.fromkeys(model.strip() for model in value if model.strip()))
        if not models:
            raise ValueError("Select at least one model.")
        return models

    @field_validator("prompt")
    @classmethod
    def trim_prompt(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Prompt cannot be blank.")
        return value

    @field_validator("reasoning_effort")
    @classmethod
    def normalize_reasoning_effort(cls, value: str | None) -> str | None:
        return _normalize_reasoning_effort(value)


class ImageGenerationRequest(BaseModel):
    model: str = Field(min_length=1)
    prompt: str = Field(min_length=1)
    width: Annotated[int, Field(ge=768)] = 1024
    height: Annotated[int, Field(ge=768)] = 1024

    @field_validator("model", "prompt")
    @classmethod
    def trim_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value cannot be blank.")
        return value

    @model_validator(mode="after")
    def validate_pixel_count(self) -> "ImageGenerationRequest":
        if self.width * self.height > 1_048_576:
            raise ValueError("Image dimensions cannot exceed 1,048,576 total pixels.")
        return self


class ModelSettingsRequest(BaseModel):
    model: str = Field(min_length=1)
    api_surface: str = "responses"
    modalities: list[str] = Field(default_factory=lambda: ["text"])
    system_prompt: str = ""
    temperature: Annotated[float, Field(ge=0, le=2)] = 0.7
    top_p: Annotated[float, Field(gt=0, le=1)] = 1.0
    max_tokens: Annotated[int, Field(ge=1, le=4096)] = 1024
    repetition_penalty: Annotated[float, Field(ge=1, le=2)] = 1.0
    guardrail_policy_names: list[str] = Field(default_factory=list)

    @field_validator("model")
    @classmethod
    def trim_model(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Model deployment name cannot be blank.")
        return value

    @field_validator("api_surface")
    @classmethod
    def normalize_api_surface(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in {"responses", "chat_completions"}:
            raise ValueError("API surface must be 'responses' or 'chat_completions'.")
        return value

    @field_validator("modalities")
    @classmethod
    def normalize_modalities(cls, value: list[str]) -> list[str]:
        modalities = list(dict.fromkeys(modality.strip().lower() for modality in value if modality.strip()))
        if not modalities:
            raise ValueError("Select at least one model capability.")
        unsupported = sorted(set(modalities) - MODEL_MODALITIES)
        if unsupported:
            raise ValueError(
                "Model capabilities must be one or more of: "
                f"{', '.join(sorted(MODEL_MODALITIES))}."
            )
        return modalities

    @field_validator("guardrail_policy_names")
    @classmethod
    def trim_guardrail_policy_names(cls, value: list[str]) -> list[str]:
        return [policy_name.strip() for policy_name in value if policy_name.strip()]


class ModelRegistrationRequest(BaseModel):
    model: str = Field(min_length=1)

    @field_validator("model")
    @classmethod
    def trim_model(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Model deployment name cannot be blank.")
        return value


class RealtimeSessionRequest(BaseModel):
    model: str | None = None
    instructions: str = "You are a helpful Foundry voice assistant. Keep responses concise."
    voice: str = "alloy"

    @field_validator("model", "instructions", "voice")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class AdminDeploymentRequest(BaseModel):
    deployment_name: str = Field(min_length=1)
    model_name: str = Field(min_length=1)
    model_version: str = Field(min_length=1)
    model_format: str = "OpenAI"
    sku_name: str = "Standard"
    sku_capacity: Annotated[int, Field(ge=1)] = 1
    version_upgrade_option: str = "OnceNewDefaultVersionAvailable"
    rai_policy_name: str | None = None
    wait_for_completion: bool = False
    api_surface: str = "responses"
    modalities: list[str] = Field(default_factory=lambda: ["text"])

    @field_validator("deployment_name", "model_name", "model_version", "model_format", "sku_name", "version_upgrade_option")
    @classmethod
    def trim_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value cannot be blank.")
        return value

    @field_validator("rai_policy_name")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @field_validator("api_surface")
    @classmethod
    def normalize_api_surface(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in {"responses", "chat_completions"}:
            raise ValueError("API surface must be 'responses' or 'chat_completions'.")
        return value

    @field_validator("modalities")
    @classmethod
    def normalize_modalities(cls, value: list[str]) -> list[str]:
        return ModelSettingsRequest.normalize_modalities(value)


@app.get("/api/config")
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
    }


@app.get("/api/auth/me")
def get_authenticated_user(request: Request) -> dict:
    user = _authenticated_user_from_request(request)
    if user is None:
        return {"authenticated": False, "entra_auth_enabled": _is_entra_auth_enabled()}
    return {**user, "entra_auth_enabled": _is_entra_auth_enabled()}


@app.get("/api/auth/login")
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


@app.get("/api/auth/callback")
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
    return response


@app.get("/api/auth/logout")
def logout():
    if not is_local_auth_configured():
        return RedirectResponse("/.auth/logout?post_logout_redirect_uri=/")
    response = RedirectResponse("/")
    response.delete_cookie(AUTH_SESSION_COOKIE)
    response.delete_cookie(AUTH_FLOW_COOKIE)
    return response


@app.get("/api/model-settings")
def get_settings(model: str) -> dict:
    try:
        return settings_to_dict(get_model_settings(model))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.put("/api/model-settings")
def put_settings(request: ModelSettingsRequest) -> dict:
    if request.guardrail_policy_names:
        if len(request.guardrail_policy_names) != 2:
            raise HTTPException(status_code=400, detail="Select two guardrails for comparison.")
        if request.guardrail_policy_names[0].lower() == request.guardrail_policy_names[1].lower():
            raise HTTPException(
                status_code=400,
                detail="Select two different guardrails for comparison.",
            )
        try:
            missing_policies = [
                policy_name
                for policy_name in request.guardrail_policy_names
                if policy_name != DEPLOYMENT_DEFAULT_GUARDRAIL
                and not guardrail_policy_exists(policy_name)
            ]
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        if missing_policies:
            raise HTTPException(
                status_code=400,
                detail="A selected guardrail no longer exists or is not selectable.",
            )
    settings = save_model_settings(
        ModelSettings(
            **{
                **request.model_dump(exclude={"guardrail_policy_names"}),
                "guardrail_policy_names": tuple(request.guardrail_policy_names),
            }
        )
    )
    return settings_to_dict(settings)


@app.get("/api/guardrails/policies")
def get_guardrail_policies() -> dict:
    try:
        return {"policies": list_guardrail_policies()}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/guardrails/deployment-policy")
def get_guardrail_deployment_policy(model: str = Query(min_length=1)) -> dict:
    try:
        return get_deployment_guardrail_policy(model)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/models")
def post_model(request: ModelRegistrationRequest) -> dict:
    try:
        settings = register_model(request.model)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "models": load_settings().models,
        "settings": settings_to_dict(settings),
    }


@app.get("/api/models")
def get_models() -> dict:
    configured_models = load_settings().models
    try:
        deployments = list_foundry_deployments()
    except Exception as exc:
        return {
            "models": configured_models,
            "deployments": [],
            "discovery_error": str(exc),
        }

    discovered_models = [deployment["name"] for deployment in deployments]
    models = list(
        dict.fromkeys(
            model
            for model in [*discovered_models, *configured_models]
            if model.strip()
        )
    )
    return {
        "models": models,
        "deployments": deployments,
        "model_modalities": {
            model: list(get_model_settings(model).modalities) for model in models
        },
        "discovery_error": None,
    }


@app.post("/api/images/generate")
async def post_image_generation(request: ImageGenerationRequest) -> dict:
    configured_for_images = "image" in get_model_settings(request.model).modalities
    if not configured_for_images and "mai-image" not in request.model.lower():
        raise HTTPException(
            status_code=400,
            detail=f"{request.model} is not configured with the image capability.",
        )
    try:
        return await asyncio.to_thread(
            generate_image,
            model=request.model,
            prompt=request.prompt,
            width=request.width,
            height=request.height,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/images/edit")
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
        return await asyncio.to_thread(
            edit_image,
            model=model,
            prompt=prompt,
            image=image_bytes,
            image_content_type=image.content_type,
            width=width,
            height=height,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/realtime/session")
async def post_realtime_session(request: RealtimeSessionRequest) -> dict:
    try:
        session = await asyncio.to_thread(
            create_realtime_client_secret,
            model=request.model,
            instructions=(
                request.instructions
                or "You are a helpful Foundry voice assistant. Keep responses concise."
            ),
            voice=request.voice or "alloy",
        )
        realtime_model = session["model"]
        model_settings = get_model_settings(realtime_model)
        return {
            **session,
            "guardrail_comparison_available": False,
            "configured_guardrail_policy_name": None,
            "guardrail_status": "Realtime uses the deployment-assigned policy.",
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/voice/traditional")
async def post_traditional_voice(
    audio: UploadFile = File(...),
    model: str = Form(...),
    conversation_id: str | None = Form(None),
    reasoning_effort: str | None = Form(None),
    use_case: str = Form("traditional_voice"),
) -> dict:
    model = model.strip()
    if not model:
        raise HTTPException(status_code=422, detail="Model deployment name cannot be blank.")
    normalized_reasoning_effort = _normalize_reasoning_effort(reasoning_effort)
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=422, detail="Recorded audio was empty.")

    try:
        transcription = await asyncio.to_thread(
            transcribe_audio,
            audio=audio_bytes,
            filename=audio.filename or "recording.webm",
            content_type=audio.content_type,
        )
        transcript = transcription["text"].strip()
        if not transcript:
            raise RuntimeError("Foundry transcription did not return any text.")

        conversation = get_or_create_conversation(conversation_id, transcript, use_case)
        model_settings = get_model_settings(model)
        variants = _guardrail_variants(model_settings, False)
        histories = _guardrail_histories(conversation.id, model, variants)
        user_message = append_message(
            conversation_id=conversation.id,
            role="user",
            content=transcript,
        )
        variant_results = await asyncio.gather(
            *(
                asyncio.to_thread(
                    _run_and_store_variant,
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
                speech = await asyncio.to_thread(
                    synthesize_speech,
                    text=result["content"],
                )
            except Exception as exc:
                return {**result, "speech_error": str(exc)}
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
            "conversation": conversation_to_dict(get_conversation(conversation.id) or conversation),
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
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/transcriptions")
async def post_transcription(
    audio: UploadFile = File(...),
    language: str = Form("en-US"),
) -> dict:
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=422, detail="Recorded audio was empty.")
    try:
        result = await asyncio.to_thread(
            transcribe_speech_audio,
            audio=audio_bytes,
            language=language.strip() or "en-US",
        )
        if not result["text"]:
            raise RuntimeError("Azure Speech did not recognize any speech in the audio.")
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/conversations")
def get_conversations(use_case: str = Query("text_chat")) -> dict:
    return {
        "conversations": [
            conversation_to_dict(item) for item in list_conversations(use_case)
        ]
    }


@app.post("/api/conversations")
def post_conversation(use_case: str = Query("text_chat")) -> dict:
    conversation = create_conversation(use_case=use_case)
    return {"conversation": conversation_to_dict(conversation), "messages": []}


@app.get("/api/conversations/{conversation_id}")
def get_conversation_by_id(
    conversation_id: str,
    use_case: str = Query("text_chat"),
) -> dict:
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    if conversation.use_case != use_case:
        raise HTTPException(status_code=404, detail="Conversation not found for this use case.")
    messages = get_conversation_messages(conversation_id)
    return {
        "conversation": conversation_to_dict(conversation),
        "messages": [message_to_dict(message) for message in messages],
    }


@app.delete("/api/conversations/{conversation_id}")
def delete_conversation_by_id(conversation_id: str) -> dict:
    if not delete_conversation(conversation_id):
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return {"deleted": True}


@app.get("/api/documents")
def get_documents() -> dict:
    try:
        return {"documents": [document_to_dict(item) for item in list_rag_documents()]}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/documents")
async def post_documents(files: list[UploadFile] = File(...)) -> dict:
    if not files:
        raise HTTPException(status_code=422, detail="Upload at least one document.")

    uploaded_documents = []
    embedding_traces = []
    try:
        for file in files:
            data = await file.read()
            result = await asyncio.to_thread(
                add_document,
                filename=file.filename or "uploaded-document",
                content_type=file.content_type,
                data=data,
            )
            uploaded_documents.append(result["document"])
            embedding_traces.append(result["embedding"])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {
        "documents": uploaded_documents,
        "embedding_traces": embedding_traces,
    }


@app.delete("/api/documents/{document_id}")
def delete_document_by_id(document_id: str) -> dict:
    try:
        if not delete_document(document_id):
            raise HTTPException(status_code=404, detail="Document not found.")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"deleted": True}


@app.get("/api/metrics/model")
def get_model_usage_metrics(
    days: Annotated[int, Query(ge=1, le=31)] = 7,
    model: str | None = None,
) -> dict:
    normalized_model = model.strip() if model else None
    return get_usage_metrics(
        days=days,
        model=normalized_model or None,
        input_token_cost_per_1k=_env_float("FOUNDRY_INPUT_TOKEN_COST_PER_1K"),
        output_token_cost_per_1k=_env_float("FOUNDRY_OUTPUT_TOKEN_COST_PER_1K"),
    )


@app.get("/api/admin/deployments/config")
def get_admin_deployment_config() -> dict:
    return admin_config_to_dict(load_admin_config())


@app.post("/api/admin/deployments")
async def post_admin_deployment(request: AdminDeploymentRequest) -> dict:
    try:
        deployment = await asyncio.to_thread(
            create_foundry_deployment,
            FoundryDeploymentRequest(
                deployment_name=request.deployment_name,
                model_name=request.model_name,
                model_version=request.model_version,
                model_format=request.model_format,
                sku_name=request.sku_name,
                sku_capacity=request.sku_capacity,
                version_upgrade_option=request.version_upgrade_option,
                rai_policy_name=request.rai_policy_name,
                wait_for_completion=request.wait_for_completion,
            ),
        )
        settings = save_model_settings(
            ModelSettings(
                model=request.deployment_name,
                api_surface=request.api_surface,
                modalities=tuple(request.modalities),
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {
        "deployment": deployment,
        "settings": settings_to_dict(settings),
    }


def _guardrail_variants(
    model_settings: ModelSettings,
    enabled: bool,
) -> list[tuple[str | None, str | None]]:
    if not enabled:
        return [(None, None)]
    if len(model_settings.guardrail_policy_names) != 2:
        raise ValueError(
            f"Guardrail comparison is enabled for {model_settings.model}, but two policies are not selected."
        )
    return [
        (
            f"policy_{index + 1}",
            None if policy_name == DEPLOYMENT_DEFAULT_GUARDRAIL else policy_name,
        )
        for index, policy_name in enumerate(model_settings.guardrail_policy_names)
    ]


def _guardrail_histories(
    conversation_id: str,
    model: str,
    variants: list[tuple[str | None, str | None]],
) -> dict[str | None, list[dict[str, str]]]:
    return {
        variant: build_model_history(
            conversation_id,
            model,
            variant,
            policy_name,
        )
        for variant, policy_name in variants
    }


def _guardrail_error_details(exc: Exception) -> dict[str, Any] | None:
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        return body
    return None


def _run_and_store_variant(
    *,
    conversation_id: str,
    model_settings: ModelSettings,
    prompt: str,
    system_prompt: str,
    reasoning_effort: str | None,
    history: list[dict[str, str]],
    variant: str | None,
    policy_name: str | None,
) -> dict[str, Any]:
    foundry_request = build_foundry_request_trace(
        model=model_settings.model,
        prompt=prompt,
        api_surface=model_settings.api_surface,
        system_prompt=system_prompt,
        temperature=model_settings.temperature,
        top_p=model_settings.top_p,
        max_tokens=model_settings.max_tokens,
        repetition_penalty=model_settings.repetition_penalty,
        reasoning_effort=reasoning_effort,
        history=history,
        guardrail_policy_name=policy_name,
    )
    try:
        response = complete_chat(
            model=model_settings.model,
            prompt=prompt,
            api_surface=model_settings.api_surface,
            system_prompt=system_prompt,
            temperature=model_settings.temperature,
            top_p=model_settings.top_p,
            max_tokens=model_settings.max_tokens,
            repetition_penalty=model_settings.repetition_penalty,
            reasoning_effort=reasoning_effort,
            history=history,
            guardrail_policy_name=policy_name,
        )
        assistant_message = append_message(
            conversation_id=conversation_id,
            role="assistant",
            content=response["content"],
            model=model_settings.model,
            api_surface=response["api_surface"],
            duration_ms=response["duration_ms"],
            usage=response["usage"],
            guardrail_variant=variant,
            guardrail_policy_name=policy_name,
            guardrail_results=response["guardrail_results"],
        )
        return {
            **response,
            "guardrail_variant": variant,
            "assistant_message": message_to_dict(assistant_message),
        }
    except Exception as exc:
        guardrail_results = _guardrail_error_details(exc)
        assistant_message = append_message(
            conversation_id=conversation_id,
            role="assistant",
            content="",
            model=model_settings.model,
            api_surface=model_settings.api_surface,
            error=str(exc),
            guardrail_variant=variant,
            guardrail_policy_name=policy_name,
            guardrail_results=guardrail_results,
        )
        return {
            "model": model_settings.model,
            "api_surface": model_settings.api_surface,
            "error": str(exc),
            "guardrail_variant": variant,
            "guardrail_policy_name": policy_name,
            "guardrail_results": guardrail_results,
            "assistant_message": message_to_dict(assistant_message),
            "foundry_request": foundry_request,
        }


@app.post("/api/chat")
async def chat(request: ChatRequest) -> dict:
    try:
        conversation = get_or_create_conversation(
            request.conversation_id, request.prompt, request.use_case
        )
        model_settings = get_model_settings(request.model)
        variants = _guardrail_variants(model_settings, request.guardrail_comparison)
        histories = _guardrail_histories(conversation.id, request.model, variants)
        user_message = append_message(
            conversation_id=conversation.id,
            role="user",
            content=request.prompt,
        )
        results = await asyncio.gather(
            *(
                asyncio.to_thread(
                    _run_and_store_variant,
                    conversation_id=conversation.id,
                    model_settings=model_settings,
                    prompt=request.prompt,
                    system_prompt=model_settings.system_prompt,
                    reasoning_effort=request.reasoning_effort,
                    history=histories[variant],
                    variant=variant,
                    policy_name=policy_name,
                )
                for variant, policy_name in variants
            )
        )
        payload = {
            "model": request.model,
            "conversation": conversation_to_dict(get_conversation(conversation.id) or conversation),
            "user_message": message_to_dict(user_message),
            "results": results,
        }
        if len(results) == 1:
            payload.update(results[0])
        return payload
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/chat/stream")
def chat_stream(request: ChatRequest) -> StreamingResponse:
    try:
        conversation = get_or_create_conversation(
            request.conversation_id, request.prompt, request.use_case
        )
        model_settings = get_model_settings(request.model)
        variants = _guardrail_variants(model_settings, request.guardrail_comparison)
        histories = _guardrail_histories(conversation.id, request.model, variants)
        user_message = append_message(
            conversation_id=conversation.id,
            role="user",
            content=request.prompt,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    def events():
        yield _sse(
            {
                "type": "start",
                "model": request.model,
                "api_surface": model_settings.api_surface,
                "conversation": conversation_to_dict(
                    get_conversation(conversation.id) or conversation
                ),
                "user_message": message_to_dict(user_message),
                "guardrail_comparison": request.guardrail_comparison,
                "guardrail_policy_names": list(model_settings.guardrail_policy_names),
            }
        )
        if request.guardrail_comparison:
            with ThreadPoolExecutor(max_workers=2) as executor:
                futures = {
                    executor.submit(
                        _run_and_store_variant,
                        conversation_id=conversation.id,
                        model_settings=model_settings,
                        prompt=request.prompt,
                        system_prompt=model_settings.system_prompt,
                        reasoning_effort=request.reasoning_effort,
                        history=histories[variant],
                        variant=variant,
                        policy_name=policy_name,
                    ): variant
                    for variant, policy_name in variants
                }
                for future in as_completed(futures):
                    result = future.result()
                    yield _sse(
                        {
                            "type": "variant_completed",
                            "result": result,
                            "conversation": conversation_to_dict(
                                get_conversation(conversation.id) or conversation
                            ),
                        }
                    )
            yield _sse(
                {
                    "type": "comparison_completed",
                    "conversation": conversation_to_dict(
                        get_conversation(conversation.id) or conversation
                    ),
                }
            )
            return

        try:
            for event in stream_chat(
                model=request.model,
                prompt=request.prompt,
                api_surface=model_settings.api_surface,
                system_prompt=model_settings.system_prompt,
                temperature=model_settings.temperature,
                top_p=model_settings.top_p,
                max_tokens=model_settings.max_tokens,
                repetition_penalty=model_settings.repetition_penalty,
                reasoning_effort=request.reasoning_effort,
                history=histories[None],
            ):
                if event["type"] == "foundry_request":
                    yield _sse(event)
                elif event["type"] == "foundry_response":
                    yield _sse(event)
                elif event["type"] == "delta":
                    yield _sse(event)
                elif event["type"] == "completed":
                    assistant_message = append_message(
                        conversation_id=conversation.id,
                        role="assistant",
                        content=event["content"],
                        model=request.model,
                        api_surface=model_settings.api_surface,
                        duration_ms=event["duration_ms"],
                        usage=event["usage"],
                        guardrail_results=event["guardrail_results"],
                    )
                    yield _sse(
                        {
                            "type": "completed",
                            "conversation": conversation_to_dict(
                                get_conversation(conversation.id) or conversation
                            ),
                            "assistant_message": message_to_dict(assistant_message),
                        }
                    )
        except Exception as exc:
            assistant_message = append_message(
                conversation_id=conversation.id,
                role="assistant",
                content="",
                model=request.model,
                api_surface=model_settings.api_surface,
                error=str(exc),
            )
            yield _sse(
                {
                    "type": "error",
                    "error": str(exc),
                    "conversation": conversation_to_dict(
                        get_conversation(conversation.id) or conversation
                    ),
                    "assistant_message": message_to_dict(assistant_message),
                }
            )

    return StreamingResponse(events(), media_type="text/event-stream")


@app.post("/api/documents/ask/stream")
def document_ask_stream(request: DocumentQuestionRequest) -> StreamingResponse:
    try:
        conversation = get_or_create_conversation(
            request.conversation_id, request.prompt, request.use_case
        )
        retrieval = retrieve_document_chunks(request.prompt)
        chunks = retrieval["chunks"]
        grounded_prompt = build_grounded_prompt(request.prompt, chunks)
        model_settings = get_model_settings(request.model)
        variants = _guardrail_variants(model_settings, request.guardrail_comparison)
        histories = _guardrail_histories(conversation.id, request.model, variants)
        user_message = append_message(
            conversation_id=conversation.id,
            role="user",
            content=request.prompt,
        )
        system_prompt = build_rag_system_prompt(model_settings.system_prompt)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    def events():
        yield _sse(
            {
                "type": "start",
                "model": request.model,
                "api_surface": model_settings.api_surface,
                "conversation": conversation_to_dict(
                    get_conversation(conversation.id) or conversation
                ),
                "user_message": message_to_dict(user_message),
                "guardrail_comparison": request.guardrail_comparison,
                "guardrail_policy_names": list(model_settings.guardrail_policy_names),
            }
        )
        yield _sse(
            {
                "type": "retrieval",
                "sources": [chunk_to_dict(chunk) for chunk in chunks],
                "embedding": retrieval["embedding"],
            }
        )
        if request.guardrail_comparison:
            with ThreadPoolExecutor(max_workers=2) as executor:
                futures = [
                    executor.submit(
                        _run_and_store_variant,
                        conversation_id=conversation.id,
                        model_settings=model_settings,
                        prompt=grounded_prompt,
                        system_prompt=system_prompt,
                        reasoning_effort=request.reasoning_effort,
                        history=histories[variant],
                        variant=variant,
                        policy_name=policy_name,
                    )
                    for variant, policy_name in variants
                ]
                for future in as_completed(futures):
                    yield _sse(
                        {
                            "type": "variant_completed",
                            "result": future.result(),
                            "conversation": conversation_to_dict(
                                get_conversation(conversation.id) or conversation
                            ),
                        }
                    )
            yield _sse(
                {
                    "type": "comparison_completed",
                    "conversation": conversation_to_dict(
                        get_conversation(conversation.id) or conversation
                    ),
                }
            )
            return

        try:
            for event in stream_chat(
                model=request.model,
                prompt=grounded_prompt,
                api_surface=model_settings.api_surface,
                system_prompt=system_prompt,
                temperature=model_settings.temperature,
                top_p=model_settings.top_p,
                max_tokens=model_settings.max_tokens,
                repetition_penalty=model_settings.repetition_penalty,
                reasoning_effort=request.reasoning_effort,
                history=histories[None],
            ):
                if event["type"] == "foundry_request":
                    yield _sse(event)
                elif event["type"] == "foundry_response":
                    yield _sse(event)
                elif event["type"] == "delta":
                    yield _sse(event)
                elif event["type"] == "completed":
                    assistant_message = append_message(
                        conversation_id=conversation.id,
                        role="assistant",
                        content=event["content"],
                        model=request.model,
                        api_surface=model_settings.api_surface,
                        duration_ms=event["duration_ms"],
                        usage=event["usage"],
                        guardrail_results=event["guardrail_results"],
                    )
                    yield _sse(
                        {
                            "type": "completed",
                            "conversation": conversation_to_dict(
                                get_conversation(conversation.id) or conversation
                            ),
                            "assistant_message": message_to_dict(assistant_message),
                        }
                    )
        except Exception as exc:
            assistant_message = append_message(
                conversation_id=conversation.id,
                role="assistant",
                content="",
                model=request.model,
                api_surface=model_settings.api_surface,
                error=str(exc),
            )
            yield _sse(
                {
                    "type": "error",
                    "error": str(exc),
                    "conversation": conversation_to_dict(
                        get_conversation(conversation.id) or conversation
                    ),
                    "assistant_message": message_to_dict(assistant_message),
                }
            )

    return StreamingResponse(events(), media_type="text/event-stream")


@app.post("/api/compare")
async def compare(request: CompareRequest) -> dict:
    try:
        conversation = get_or_create_conversation(
            request.conversation_id, request.prompt, request.use_case
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
            conversation.id,
            model,
            variant,
            policy_name,
        )
        for model, variants in variants_by_model.items()
        for variant, policy_name in variants
    }
    user_message = append_message(
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
        "conversation": conversation_to_dict(get_conversation(conversation.id) or conversation),
        "user_message": message_to_dict(user_message),
        "results": results,
    }


@app.get("/")
def index() -> FileResponse:
    if FRONTEND_INDEX.exists():
        return FileResponse(FRONTEND_INDEX)
    raise HTTPException(
        status_code=404,
        detail="Frontend build not found. Run npm install and npm run build in the frontend folder.",
    )


@app.get("/favicon.svg")
def favicon() -> FileResponse:
    favicon_path = FRONTEND_DIST / "favicon.svg"
    if favicon_path.exists():
        return FileResponse(favicon_path, media_type="image/svg+xml")
    raise HTTPException(status_code=404, detail="Favicon not found.")


@app.get("/{full_path:path}")
def spa_fallback(full_path: str) -> FileResponse:
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found.")
    if FRONTEND_INDEX.exists():
        return FileResponse(FRONTEND_INDEX)
    raise HTTPException(status_code=404, detail="Frontend build not found.")


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _normalize_reasoning_effort(value: str | None) -> str | None:
    if value is None:
        return None
    normalized_value = value.strip().lower()
    if not normalized_value or normalized_value == "default":
        return None
    if normalized_value not in REASONING_EFFORTS:
        raise ValueError(
            "Reasoning effort must be one of: none, minimal, low, medium, high, xhigh."
        )
    return normalized_value


def _env_float(name: str) -> float:
    value = os.getenv(name, "0").strip()
    if not value:
        return 0
    try:
        return float(value)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a number.") from exc
