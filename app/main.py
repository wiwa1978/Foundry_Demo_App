import asyncio
import base64
import json
import os
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

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
    load_admin_config,
)
from app.foundry_client import (
    build_foundry_request_trace,
    complete_chat,
    create_realtime_client_secret,
    load_settings,
    stream_chat,
    synthesize_speech,
    transcribe_audio,
)
from app.model_settings import (
    MODEL_MODALITIES,
    ModelSettings,
    get_model_settings,
    initialize_database,
    register_model,
    save_model_settings,
    settings_to_dict,
)

load_dotenv()

app = FastAPI(title="Foundry Chat App")
REASONING_EFFORTS = {"none", "minimal", "low", "medium", "high", "xhigh"}

PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
FRONTEND_INDEX = FRONTEND_DIST / "index.html"

if (FRONTEND_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")


@app.on_event("startup")
def startup() -> None:
    initialize_database()
    initialize_conversation_database()


class ChatRequest(BaseModel):
    model: str = Field(min_length=1)
    prompt: str = Field(min_length=1)
    conversation_id: str | None = None
    reasoning_effort: str | None = None

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


class ModelSettingsRequest(BaseModel):
    model: str = Field(min_length=1)
    api_surface: str = "responses"
    modalities: list[str] = Field(default_factory=lambda: ["text"])
    system_prompt: str = ""
    temperature: Annotated[float, Field(ge=0, le=2)] = 0.7
    top_p: Annotated[float, Field(gt=0, le=1)] = 1.0
    max_tokens: Annotated[int, Field(ge=1, le=4096)] = 1024
    repetition_penalty: Annotated[float, Field(ge=1, le=2)] = 1.0

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
    }


@app.get("/api/model-settings")
def get_settings(model: str) -> dict:
    try:
        return settings_to_dict(get_model_settings(model))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.put("/api/model-settings")
def put_settings(request: ModelSettingsRequest) -> dict:
    settings = save_model_settings(ModelSettings(**request.model_dump()))
    return settings_to_dict(settings)


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


@app.post("/api/realtime/session")
async def post_realtime_session(request: RealtimeSessionRequest) -> dict:
    try:
        return await asyncio.to_thread(
            create_realtime_client_secret,
            model=request.model,
            instructions=(
                request.instructions
                or "You are a helpful Foundry voice assistant. Keep responses concise."
            ),
            voice=request.voice or "alloy",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/voice/traditional")
async def post_traditional_voice(
    audio: UploadFile = File(...),
    model: str = Form(...),
    conversation_id: str | None = Form(None),
    reasoning_effort: str | None = Form(None),
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

        conversation = get_or_create_conversation(conversation_id, transcript)
        history = build_model_history(conversation.id, model)
        user_message = append_message(
            conversation_id=conversation.id,
            role="user",
            content=transcript,
        )
        model_settings = get_model_settings(model)
        foundry_request = build_foundry_request_trace(
            model=model,
            prompt=transcript,
            api_surface=model_settings.api_surface,
            system_prompt=model_settings.system_prompt,
            temperature=model_settings.temperature,
            top_p=model_settings.top_p,
            max_tokens=model_settings.max_tokens,
            repetition_penalty=model_settings.repetition_penalty,
            reasoning_effort=normalized_reasoning_effort,
            history=history,
        )
        try:
            chat_response = await asyncio.to_thread(
                complete_chat,
                model=model,
                prompt=transcript,
                api_surface=model_settings.api_surface,
                system_prompt=model_settings.system_prompt,
                temperature=model_settings.temperature,
                top_p=model_settings.top_p,
                max_tokens=model_settings.max_tokens,
                repetition_penalty=model_settings.repetition_penalty,
                reasoning_effort=normalized_reasoning_effort,
                history=history,
            )
        except Exception as exc:
            assistant_message = append_message(
                conversation_id=conversation.id,
                role="assistant",
                content="",
                model=model,
                api_surface=model_settings.api_surface,
                error=str(exc),
            )
            return {
                "model": model,
                "error": str(exc),
                "transcription": transcription,
                "conversation": conversation_to_dict(
                    get_conversation(conversation.id) or conversation
                ),
                "user_message": message_to_dict(user_message),
                "assistant_message": message_to_dict(assistant_message),
                "foundry_request": foundry_request,
            }

        assistant_message = append_message(
            conversation_id=conversation.id,
            role="assistant",
            content=chat_response["content"],
            model=model,
            api_surface=chat_response["api_surface"],
            duration_ms=chat_response["duration_ms"],
            usage=chat_response["usage"],
        )
        speech = await asyncio.to_thread(synthesize_speech, text=chat_response["content"])

        return {
            "model": model,
            "transcription": transcription,
            "chat": chat_response,
            "speech": {
                **{key: value for key, value in speech.items() if key != "audio"},
                "audio_base64": base64.b64encode(speech["audio"]).decode("ascii"),
            },
            "conversation": conversation_to_dict(get_conversation(conversation.id) or conversation),
            "user_message": message_to_dict(user_message),
            "assistant_message": message_to_dict(assistant_message),
        }
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/conversations")
def get_conversations() -> dict:
    return {"conversations": [conversation_to_dict(item) for item in list_conversations()]}


@app.post("/api/conversations")
def post_conversation() -> dict:
    conversation = create_conversation()
    return {"conversation": conversation_to_dict(conversation), "messages": []}


@app.get("/api/conversations/{conversation_id}")
def get_conversation_by_id(conversation_id: str) -> dict:
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")
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


@app.post("/api/chat")
async def chat(request: ChatRequest) -> dict:
    try:
        conversation = get_or_create_conversation(request.conversation_id, request.prompt)
        history = build_model_history(conversation.id, request.model)
        user_message = append_message(
            conversation_id=conversation.id,
            role="user",
            content=request.prompt,
        )
        model_settings = get_model_settings(request.model)
        foundry_request = build_foundry_request_trace(
            model=request.model,
            prompt=request.prompt,
            api_surface=model_settings.api_surface,
            system_prompt=model_settings.system_prompt,
            temperature=model_settings.temperature,
            top_p=model_settings.top_p,
            max_tokens=model_settings.max_tokens,
            repetition_penalty=model_settings.repetition_penalty,
            reasoning_effort=request.reasoning_effort,
            history=history,
        )
        try:
            response = await asyncio.to_thread(
                complete_chat,
                model=request.model,
                prompt=request.prompt,
                api_surface=model_settings.api_surface,
                system_prompt=model_settings.system_prompt,
                temperature=model_settings.temperature,
                top_p=model_settings.top_p,
                max_tokens=model_settings.max_tokens,
                repetition_penalty=model_settings.repetition_penalty,
                reasoning_effort=request.reasoning_effort,
                history=history,
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
            return {
                "model": request.model,
                "error": str(exc),
                "conversation": conversation_to_dict(
                    get_conversation(conversation.id) or conversation
                ),
                "user_message": message_to_dict(user_message),
                "assistant_message": message_to_dict(assistant_message),
                "foundry_request": foundry_request,
            }
        assistant_message = append_message(
            conversation_id=conversation.id,
            role="assistant",
            content=response["content"],
            model=request.model,
            api_surface=response["api_surface"],
            duration_ms=response["duration_ms"],
            usage=response["usage"],
        )
        return {
            **response,
            "conversation": conversation_to_dict(get_conversation(conversation.id) or conversation),
            "user_message": message_to_dict(user_message),
            "assistant_message": message_to_dict(assistant_message),
        }
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/chat/stream")
def chat_stream(request: ChatRequest) -> StreamingResponse:
    try:
        conversation = get_or_create_conversation(request.conversation_id, request.prompt)
        history = build_model_history(conversation.id, request.model)
        user_message = append_message(
            conversation_id=conversation.id,
            role="user",
            content=request.prompt,
        )
        model_settings = get_model_settings(request.model)
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
            }
        )
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
                history=history,
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
        conversation = get_or_create_conversation(request.conversation_id, request.prompt)
        retrieval = retrieve_document_chunks(request.prompt)
        chunks = retrieval["chunks"]
        grounded_prompt = build_grounded_prompt(request.prompt, chunks)
        history = build_model_history(conversation.id, request.model)
        user_message = append_message(
            conversation_id=conversation.id,
            role="user",
            content=request.prompt,
        )
        model_settings = get_model_settings(request.model)
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
            }
        )
        yield _sse(
            {
                "type": "retrieval",
                "sources": [chunk_to_dict(chunk) for chunk in chunks],
                "embedding": retrieval["embedding"],
            }
        )
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
                history=history,
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
        conversation = get_or_create_conversation(request.conversation_id, request.prompt)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    histories = {
        model: build_model_history(conversation.id, model) for model in request.models
    }
    user_message = append_message(
        conversation_id=conversation.id,
        role="user",
        content=request.prompt,
    )

    async def run_model(model: str) -> dict:
        model_settings = get_model_settings(model)
        foundry_request = build_foundry_request_trace(
            model=model,
            prompt=request.prompt,
            api_surface=model_settings.api_surface,
            system_prompt=model_settings.system_prompt,
            temperature=model_settings.temperature,
            top_p=model_settings.top_p,
            max_tokens=model_settings.max_tokens,
            repetition_penalty=model_settings.repetition_penalty,
            reasoning_effort=request.reasoning_effort,
            history=histories[model],
        )
        try:
            response = await asyncio.to_thread(
                complete_chat,
                model=model,
                prompt=request.prompt,
                api_surface=model_settings.api_surface,
                system_prompt=model_settings.system_prompt,
                temperature=model_settings.temperature,
                top_p=model_settings.top_p,
                max_tokens=model_settings.max_tokens,
                repetition_penalty=model_settings.repetition_penalty,
                reasoning_effort=request.reasoning_effort,
                history=histories[model],
            )
            assistant_message = append_message(
                conversation_id=conversation.id,
                role="assistant",
                content=response["content"],
                model=model,
                api_surface=response["api_surface"],
                duration_ms=response["duration_ms"],
                usage=response["usage"],
            )
        except Exception as exc:
            assistant_message = append_message(
                conversation_id=conversation.id,
                role="assistant",
                content="",
                model=model,
                api_surface=model_settings.api_surface,
                error=str(exc),
            )
            return {
                "model": model,
                "error": str(exc),
                "assistant_message": message_to_dict(assistant_message),
                "foundry_request": foundry_request,
            }
        return {
            **response,
            "assistant_message": message_to_dict(assistant_message),
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
