import pytest
from pydantic import ValidationError

from app.schemas import (
    AdminDeploymentRequest,
    ChatRequest,
    CompareRequest,
    DocumentQuestionRequest,
    ImageGenerationRequest,
    ModelRegistrationRequest,
    ModelSettingsRequest,
    RealtimeSessionRequest,
)


def test_chat_and_document_defaults_are_preserved():
    assert ChatRequest(model=" model ", prompt=" prompt ").model_dump() == {
        "model": "model",
        "prompt": "prompt",
        "conversation_id": None,
        "reasoning_effort": None,
        "guardrail_comparison": False,
        "use_case": "text_chat",
    }
    assert DocumentQuestionRequest(model="m", prompt="p").use_case == "document_qa"


def test_compare_deduplicates_and_normalizes_models():
    request = CompareRequest(models=["a", " a ", "b"], prompt=" prompt ")
    assert request.models == ["a", "b"]
    assert request.prompt == "prompt"


def test_model_settings_and_admin_normalize_shared_fields():
    settings = ModelSettingsRequest(
        model=" model ",
        api_surface=" RESPONSES ",
        modalities=["Text", " text ", "voice"],
    )
    admin = AdminDeploymentRequest(
        deployment_name=" demo ",
        model_name="gpt",
        model_version="1",
        modalities=["TEXT"],
    )
    assert settings.modalities == ["text", "voice"]
    assert settings.api_surface == "responses"
    assert admin.deployment_name == "demo"
    assert admin.modalities == ["text"]


def test_realtime_blank_values_keep_existing_fallback_contract():
    request = RealtimeSessionRequest(model=" ", instructions=" ", voice=" ")
    assert request.model is None
    assert request.instructions is None
    assert request.voice is None


@pytest.mark.parametrize(
    "model",
    [
        lambda: ImageGenerationRequest(model="image", prompt="p", width=2000),
        lambda: ModelRegistrationRequest(model=" "),
    ],
)
def test_invalid_schema_inputs_are_rejected(model):
    with pytest.raises(ValidationError):
        model()
