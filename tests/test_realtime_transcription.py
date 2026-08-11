from unittest.mock import MagicMock, patch

from app.infrastructure.azure.foundry.realtime import (
    _realtime_transcription_session,
    create_realtime_translation_connection_info,
)
from app.infrastructure.azure.foundry.settings import FoundrySettings


def test_transcription_session_applies_optional_controls():
    session = _realtime_transcription_session(
        "gpt-realtime-whisper",
        language="NL",
        delay="low",
        turn_detection="semantic_vad",
    )

    audio_input = session["audio"]["input"]
    assert audio_input["transcription"] == {
        "model": "gpt-realtime-whisper",
        "language": "nl",
        "delay": "low",
    }
    assert audio_input["turn_detection"] == {
        "type": "semantic_vad",
        "eagerness": "low",
    }


def test_transcription_session_can_use_manual_commits():
    session = _realtime_transcription_session(
        "gpt-realtime-whisper",
        turn_detection="none",
    )

    assert session["audio"]["input"]["turn_detection"] is None


@patch("app.infrastructure.azure.foundry.realtime.get_azure_credential")
@patch("app.infrastructure.azure.foundry.realtime.load_settings")
def test_translation_connection_uses_dedicated_contract(
    load_settings: MagicMock, get_credential: MagicMock
):
    load_settings.return_value = FoundrySettings(
        endpoint=None,
        models=[],
        realtime_endpoint="https://demo.services.ai.azure.com/openai/v1",
        realtime_model="gpt-realtime-2.1",
        embedding_model="",
        transcription_model="",
        tts_model="",
        tts_voice="",
        speech_endpoint=None,
        speech_key=None,
        speech_transcription_model="",
        realtime_transcription_model="gpt-realtime-whisper",
        realtime_translation_model="gpt-realtime-translate",
    )
    get_credential.return_value.get_token.return_value.token = "token"

    connection = create_realtime_translation_connection_info(target_language="fr")

    assert connection["url"] == (
        "wss://demo.services.ai.azure.com/openai/v1/realtime/translations"
        "?model=gpt-realtime-translate"
    )
    assert connection["session_update"]["session"]["audio"] == {
        "input": {
            "transcription": {"model": "gpt-realtime-whisper"},
            "noise_reduction": {"type": "near_field"},
        },
        "output": {"language": "fr"},
    }
