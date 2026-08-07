import asyncio
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.features.admin.service import create_deployment
from app.features.models.service import discover_models
from app.features.voice.service import traditional_voice_service
from app.model_settings import ModelSettings
from app.providers.settings import FoundrySettings
from app.schemas import AdminDeploymentRequest


def _settings() -> FoundrySettings:
    return FoundrySettings(
        endpoint="https://example.services.ai.azure.com/api/projects/demo",
        models=["configured-chat"],
        realtime_endpoint=None,
        realtime_model="",
        embedding_model="embedding",
        transcription_model="configured-transcribe",
        tts_model="configured-tts",
        tts_voice="alloy",
        speech_endpoint="https://speech.example.com",
        speech_key=None,
        speech_transcription_model="speech-transcribe",
    )


def test_model_discovery_classifies_deployments_and_preserves_configured_models():
    deployments = [
        {"name": "chat", "model_name": "gpt-5"},
        {"name": "speech-in", "model_name": "whisper"},
        {"name": "speech-out", "model_name": "gpt-4o-mini-tts"},
    ]
    with patch("app.features.models.service.load_settings", return_value=_settings()):
        with patch(
            "app.features.models.service.list_foundry_deployments",
            return_value=deployments,
        ):
            with patch(
                "app.features.models.service.get_model_settings",
                side_effect=lambda model: ModelSettings(model=model),
            ):
                result = discover_models()

    assert result["models"] == ["chat", "speech-in", "speech-out", "configured-chat"]
    assert result["traditional_transcription_models"] == ["speech-in"]
    assert result["tts_models"] == ["speech-out"]
    assert result["discovery_error"] is None


def test_model_discovery_sanitizes_provider_failures():
    with patch("app.features.models.service.load_settings", return_value=_settings()):
        with patch(
            "app.features.models.service.list_foundry_deployments",
            side_effect=RuntimeError("provider secret"),
        ):
            result = discover_models()

    assert result["deployments"] == []
    assert result["discovery_error"] == "Model discovery failed. Try again later."
    assert "provider secret" not in result["discovery_error"]


def test_admin_deployment_service_registers_created_deployment():
    payload = AdminDeploymentRequest(
        deployment_name="demo",
        model_name="gpt-5",
        model_version="2026-01-01",
        modalities=["text", "voice"],
    )
    run_model_call = AsyncMock(return_value={"status": "accepted"})
    saved = ModelSettings(model="demo", modalities=("text", "voice"))
    with patch("app.features.admin.service.run_model_call", run_model_call):
        with patch("app.features.admin.service.save_model_settings", return_value=saved):
            result = asyncio.run(create_deployment(payload))

    assert run_model_call.await_args is not None
    request = run_model_call.await_args.args[1]
    assert request.deployment_name == "demo"
    assert result["deployment"] == {"status": "accepted"}
    assert result["settings"]["modalities"] == ("text", "voice")


def test_traditional_voice_service_combines_transcription_chat_and_speech():
    conversation = SimpleNamespace(id="conversation-1")
    model_settings = ModelSettings(model="chat-model")
    model_calls = AsyncMock(
        side_effect=[
            {"model": "transcribe", "text": "Hello"},
            {"model": "tts", "audio": b"mp3", "audio_mime_type": "audio/mpeg"},
        ]
    )
    variant_result = {
        "model": "chat-model",
        "content": "Hi there",
        "assistant_message": {"id": "assistant-1"},
    }
    with ExitStack() as stack:
        stack.enter_context(patch("app.features.voice.service.run_model_call", model_calls))
        stack.enter_context(
            patch(
                "app.features.voice.service.get_or_create_conversation",
                return_value=conversation,
            )
        )
        stack.enter_context(
            patch("app.features.voice.service.get_model_settings", return_value=model_settings)
        )
        stack.enter_context(
            patch(
                "app.features.voice.service.chat_service.guardrail_variants",
                return_value=[(None, None)],
            )
        )
        stack.enter_context(
            patch(
                "app.features.voice.service.chat_service.guardrail_histories",
                return_value={None: []},
            )
        )
        stack.enter_context(
            patch(
                "app.features.voice.service.chat_service.run_and_store_variant",
                return_value=variant_result,
            )
        )
        stack.enter_context(
            patch("app.features.voice.service.append_message", return_value=MagicMock())
        )
        stack.enter_context(
            patch("app.features.voice.service.get_conversation", return_value=None)
        )
        stack.enter_context(
            patch(
                "app.features.voice.service.conversation_to_dict",
                return_value={"id": "conversation-1"},
            )
        )
        stack.enter_context(
            patch(
                "app.features.voice.service.message_to_dict",
                return_value={"id": "user-1"},
            )
        )
        result = asyncio.run(
            traditional_voice_service.process(
                scope=MagicMock(),
                audio=b"audio",
                filename="recording.webm",
                content_type="audio/webm",
                model="chat-model",
                transcription_model=None,
                tts_model=None,
                tts_voice=None,
                conversation_id=None,
                reasoning_effort=None,
                use_case="traditional_voice",
            )
        )

    assert result["transcription"]["text"] == "Hello"
    assert result["speech"]["audio_base64"] == "bXAz"
    assert result["chat"]["content"] == "Hi there"
    assert model_calls.await_count == 2
