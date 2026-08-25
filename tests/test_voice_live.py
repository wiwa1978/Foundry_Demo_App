import unittest
from unittest.mock import MagicMock, patch

from app.infrastructure.azure.foundry.realtime import create_voice_live_connection_info
from app.infrastructure.azure.foundry.settings import FoundrySettings


class VoiceLiveTests(unittest.TestCase):
    @patch("app.infrastructure.azure.foundry.realtime.get_azure_credential")
    @patch("app.infrastructure.azure.foundry.realtime.load_settings")
    def test_connection_info_uses_resource_endpoint_and_entra_token(
        self, load_settings: MagicMock, get_credential: MagicMock
    ) -> None:
        load_settings.return_value = FoundrySettings(
            endpoint=None,
            models=[],
            realtime_endpoint=None,
            realtime_model="",
            embedding_model="",
            transcription_model="",
            tts_model="",
            tts_voice="",
            speech_endpoint=None,
            speech_key=None,
            speech_transcription_model="",
            voice_live_endpoint="https://demo.services.ai.azure.com/",
            voice_live_model="gpt-realtime",
            voice_live_voice="en-US-Ava:DragonHDLatestNeural",
        )
        get_credential.return_value.get_token.return_value.token = "entra-token"

        result = create_voice_live_connection_info()

        self.assertEqual(
            result["url"],
            "wss://demo.services.ai.azure.com/voice-live/realtime/calls"
            "?api-version=2026-01-01-preview&model=gpt-realtime",
        )
        self.assertEqual(result["token"], "entra-token")
        get_credential.return_value.get_token.assert_called_once_with(
            "https://ai.azure.com/.default"
        )

    @patch("app.infrastructure.azure.foundry.realtime.load_settings")
    def test_connection_info_requires_endpoint(self, load_settings: MagicMock) -> None:
        load_settings.return_value = FoundrySettings(
            endpoint=None,
            models=[],
            realtime_endpoint=None,
            realtime_model="",
            embedding_model="",
            transcription_model="",
            tts_model="",
            tts_voice="",
            speech_endpoint=None,
            speech_key=None,
            speech_transcription_model="",
        )

        with self.assertRaisesRegex(RuntimeError, "Voice Live is not configured"):
            create_voice_live_connection_info()

    @patch("app.infrastructure.azure.foundry.realtime.load_settings")
    def test_connection_info_rejects_http_endpoint(self, load_settings: MagicMock) -> None:
        load_settings.return_value = FoundrySettings(
            endpoint=None,
            models=[],
            realtime_endpoint=None,
            realtime_model="",
            embedding_model="",
            transcription_model="",
            tts_model="",
            tts_voice="",
            speech_endpoint=None,
            speech_key=None,
            speech_transcription_model="",
            voice_live_endpoint="http://demo.services.ai.azure.com/",
            voice_live_model="gpt-realtime",
        )

        with self.assertRaisesRegex(RuntimeError, "absolute HTTPS"):
            create_voice_live_connection_info()


if __name__ == "__main__":
    unittest.main()
