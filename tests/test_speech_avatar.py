import json
from unittest.mock import MagicMock, patch

import pytest

from app.infrastructure.azure.foundry.settings import FoundrySettings
from app.infrastructure.azure.foundry.speech import (
    get_batch_avatar_synthesis,
    submit_batch_avatar_synthesis,
)


def _settings(*, endpoint: str | None, key: str | None) -> FoundrySettings:
    return FoundrySettings(
        endpoint=None,
        models=[],
        realtime_endpoint=None,
        realtime_model="",
        embedding_model="",
        transcription_model="",
        tts_model="",
        tts_voice="",
        speech_endpoint=endpoint,
        speech_key=key,
        speech_transcription_model="",
    )


def _response(payload: str) -> MagicMock:
    response = MagicMock()
    response.__enter__.return_value.read.return_value = payload.encode("utf-8")
    return response


def test_submit_batch_avatar_builds_the_sample_payload(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    job = {"id": "avatar-job", "status": "NotStarted"}
    with (
        patch(
            "app.infrastructure.azure.foundry.speech.load_settings",
            return_value=_settings(
                endpoint="https://speech.example.cognitiveservices.azure.com/",
                key="speech-key",
            ),
        ),
        patch(
            "app.infrastructure.azure.foundry.speech.open_checked_url",
            return_value=_response(json.dumps(job)),
        ) as open_url,
        patch(
            "app.infrastructure.azure.foundry.speech.uuid.uuid4",
            return_value=MagicMock(hex="fixed-job"),
        ),
    ):
        result = submit_batch_avatar_synthesis(
            text="Hello from Azure.",
            avatar_type="video",
            character="lisa",
            style="graceful-sitting",
            voice="en-US-Ava:DragonHDLatestNeural",
        )

    assert result == {
        "id": "avatar-job",
        "status": "NotStarted",
        "output_url": None,
        "summary_url": None,
        "error": None,
    }
    request = open_url.call_args.args[0]
    assert request.full_url == (
        "https://speech.example.cognitiveservices.azure.com"
        "/avatar/batchsyntheses/avatar-fixed-job?api-version=2024-08-01"
    )
    payload = json.loads(request.data.decode("utf-8"))
    assert payload == {
        "synthesisConfig": {"voice": "en-US-Ava:DragonHDLatestNeural"},
        "inputKind": "PlainText",
        "inputs": [{"content": "Hello from Azure."}],
        "avatarConfig": {
            "videoFormat": "mp4",
            "videoCodec": "h264",
            "subtitleType": "soft_embedded",
            "customized": False,
            "useBuiltInVoice": False,
            "talkingAvatarCharacter": "lisa",
            "talkingAvatarStyle": "graceful-sitting",
            "backgroundColor": "#FFFFFFFF",
        },
    }
    assert request.get_header("Ocp-apim-subscription-key") == "speech-key"


def test_submit_batch_avatar_supports_photo_and_custom_voice(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    with (
        patch(
            "app.infrastructure.azure.foundry.speech.load_settings",
            return_value=_settings(
                endpoint="https://speech.example.cognitiveservices.azure.com",
                key="speech-key",
            ),
        ),
        patch(
            "app.infrastructure.azure.foundry.speech.open_checked_url",
            return_value=_response(
                json.dumps({"id": "avatar-job", "status": "Running"})
            ),
        ) as open_url,
    ):
        submit_batch_avatar_synthesis(
            text="Custom avatar",
            avatar_type="photo",
            character="anika",
            voice="brand-voice",
            custom_voice_endpoint_id="custom-voice-deployment",
            customized=True,
            use_built_in_voice=True,
            background_image="https://cdn.example.test/background.png",
        )

    payload = json.loads(open_url.call_args.args[0].data.decode("utf-8"))
    assert payload["customVoices"] == {
        "brand-voice": "custom-voice-deployment",
    }
    assert payload["avatarConfig"] == {
        "videoFormat": "mp4",
        "videoCodec": "h264",
        "subtitleType": "soft_embedded",
        "customized": True,
        "useBuiltInVoice": True,
        "photoAvatarBaseModel": "vasa-1",
        "talkingAvatarCharacter": "anika",
        "backgroundImage": "https://cdn.example.test/background.png",
    }


def test_get_batch_avatar_returns_video_and_summary_urls(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    with (
        patch(
            "app.infrastructure.azure.foundry.speech.load_settings",
            return_value=_settings(
                endpoint="https://speech.example.cognitiveservices.azure.com",
                key="speech-key",
            ),
        ),
        patch(
            "app.infrastructure.azure.foundry.speech.open_checked_url",
            return_value=_response(
                json.dumps(
                    {
                        "id": "avatar-job",
                        "status": "Succeeded",
                        "outputs": {
                            "result": "https://cdn.example.test/avatar.mp4",
                            "summary": "https://cdn.example.test/summary.json",
                        },
                    }
                )
            ),
        ),
    ):
        result = get_batch_avatar_synthesis("avatar-job")

    assert result == {
        "id": "avatar-job",
        "status": "Succeeded",
        "output_url": "https://cdn.example.test/avatar.mp4",
        "summary_url": "https://cdn.example.test/summary.json",
        "error": None,
    }


def test_batch_avatar_validates_endpoint_and_job_id():
    with patch(
        "app.infrastructure.azure.foundry.speech.load_settings",
        return_value=_settings(endpoint=None, key=None),
    ):
        with pytest.raises(RuntimeError, match="AZURE_SPEECH_ENDPOINT"):
            get_batch_avatar_synthesis("avatar-job")
