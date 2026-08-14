from types import SimpleNamespace
from unittest.mock import patch

from app.api.features.models.service import configured_use_case_model_map, discover_models


def test_discovery_includes_gpt_transcribe_transcription_choice():
    settings = SimpleNamespace(
        models=["chat-model"],
        speech_transcription_model="MAI-Transcribe-1.5",
        transcription_model="gpt-4o-mini-transcribe",
        tts_model="",
    )

    administration = SimpleNamespace(list_deployments=lambda: [])

    model_service = SimpleNamespace(
        list=lambda seed_models: seed_models,
        get=lambda model: SimpleNamespace(modalities=("text",)),
    )

    with patch("app.api.features.models.service.load_settings", return_value=settings):
        response = discover_models(administration, model_service)

    assert response["transcription_models"] == [
        "MAI-Transcribe-1.5",
        "gpt-4o-mini-transcribe",
        "gpt-transcribe",
    ]
    assert response["text_models"] == ["chat-model"]
    assert response["realtime_transcription_models"] == []
    assert response["use_case_model_map"]["youtube_summary"] == {
        "text": "text_models",
        "transcription": "transcription_models",
    }


def test_discovery_excludes_realtime_only_transcription_deployments():
    settings = SimpleNamespace(
        models=[],
        speech_transcription_model="MAI-Transcribe-1.5",
        transcription_model="gpt-4o-mini-transcribe",
        tts_model="",
    )
    administration = SimpleNamespace(
        list_deployments=lambda: [
            {"name": "batch-stt", "model_name": "gpt-4o-transcribe"},
            {"name": "realtime-stt", "model_name": "gpt-realtime-whisper"},
            {"name": "live-stt", "model_name": "gpt-live-transcribe"},
        ]
    )
    model_service = SimpleNamespace(
        list=lambda seed_models: seed_models,
        get=lambda model: SimpleNamespace(modalities=("voice",)),
    )

    with patch("app.api.features.models.service.load_settings", return_value=settings):
        response = discover_models(administration, model_service)

    assert response["transcription_models"] == [
        "batch-stt",
        "MAI-Transcribe-1.5",
        "gpt-4o-mini-transcribe",
        "gpt-transcribe",
    ]
    assert response["traditional_transcription_models"] == ["batch-stt"]
    assert response["realtime_transcription_models"] == ["realtime-stt", "live-stt"]


def test_discovery_returns_canonical_text_model_list():
    settings = SimpleNamespace(
        models=[],
        speech_transcription_model="MAI-Transcribe-1.5",
        transcription_model="gpt-4o-mini-transcribe",
        tts_model="",
    )
    administration = SimpleNamespace(
        list_deployments=lambda: [
            {"name": "chat-a", "model_name": "gpt-5.5"},
            {"name": "chat-b", "model_name": "gpt-5.6-sol"},
            {"name": "stt", "model_name": "gpt-4o-transcribe"},
            {"name": "image", "model_name": "gpt-image-1"},
            {"name": "embed", "model_name": "text-embedding-3-large"},
        ]
    )
    model_service = SimpleNamespace(
        list=lambda seed_models: seed_models,
        get=lambda model: SimpleNamespace(
            modalities=("voice",)
            if model == "stt"
            else ("image",)
            if model == "image"
            else ("text",)
        ),
    )

    with patch("app.api.features.models.service.load_settings", return_value=settings):
        response = discover_models(administration, model_service)

    assert response["text_models"] == ["chat-a", "chat-b"]
    assert response["image_models"] == ["image"]


def test_discovery_allows_static_use_case_bucket_map(monkeypatch):
    monkeypatch.setenv(
        "USE_CASE_MODEL_MAP",
        '{"text_chat":"text_models",'
        '"youtube_summary":{"text":"text_models","transcription":"transcription_models"}}',
    )

    response = configured_use_case_model_map()

    assert response["text_chat"] == "text_models"
    assert response["youtube_summary"] == {
        "text": "text_models",
        "transcription": "transcription_models",
    }
    assert response["comparison"] == "text_models"
    assert response["reasoning_comparison"] == "text_models"
    assert response["text_to_image"] == "image_models"
    assert response["image_to_image"] == "image_models"
    assert response["image_comparison"] == "image_models"
