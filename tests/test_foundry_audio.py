import unittest
import base64
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.foundry_client import FoundrySettings, _azure_openai_endpoint, synthesize_speech


class FoundryAudioTests(unittest.TestCase):
    def test_audio_endpoint_uses_azure_openai_resource_host(self) -> None:
        endpoint = _azure_openai_endpoint(
            "https://demo.services.ai.azure.com/api/projects/example"
        )

        self.assertEqual(endpoint, "https://demo.openai.azure.com")

    @patch("app.foundry_client._create_audio_client")
    @patch("app.foundry_client.load_settings")
    def test_gpt_audio_synthesis_uses_chat_completions(
        self, load_settings: MagicMock, create_client: MagicMock
    ) -> None:
        load_settings.return_value = _settings()
        client = create_client.return_value.__enter__.return_value
        client.chat.completions.create.return_value = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        audio=SimpleNamespace(data=base64.b64encode(b"mp3-data").decode())
                    )
                )
            ]
        )

        result = synthesize_speech(text="Hello", model="gpt-audio-mini", voice="coral")

        self.assertEqual(result["audio"], b"mp3-data")
        self.assertEqual(result["foundry_request"]["path"], "/chat/completions")
        request = client.chat.completions.create.call_args.kwargs
        self.assertEqual(request["modalities"], ["text", "audio"])
        self.assertEqual(request["audio"], {"voice": "coral", "format": "mp3"})

    @patch("app.foundry_client._create_audio_client")
    @patch("app.foundry_client.load_settings")
    def test_dedicated_tts_synthesis_uses_audio_speech(
        self, load_settings: MagicMock, create_client: MagicMock
    ) -> None:
        load_settings.return_value = _settings()
        client = create_client.return_value.__enter__.return_value
        client.audio.speech.create.return_value.read.return_value = b"mp3-data"

        result = synthesize_speech(text="Hello", model="tts")

        self.assertEqual(result["audio"], b"mp3-data")
        self.assertEqual(result["foundry_request"]["path"], "/audio/speech")


def _settings() -> FoundrySettings:
    return FoundrySettings(
        endpoint="https://demo.services.ai.azure.com/api/projects/example",
        models=[],
        realtime_endpoint=None,
        realtime_model="",
        embedding_model="",
        transcription_model="gpt-4o-mini-transcribe",
        tts_model="gpt-audio-mini",
        tts_voice="alloy",
        speech_endpoint=None,
        speech_key=None,
        speech_transcription_model="",
    )
