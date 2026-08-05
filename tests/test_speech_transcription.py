import sys
import unittest
from types import ModuleType, SimpleNamespace
from unittest.mock import MagicMock, patch

from app.foundry_client import FoundrySettings, transcribe_speech_audio


class SpeechTranscriptionTests(unittest.TestCase):
    @patch("app.foundry_client.get_azure_credential")
    @patch("app.foundry_client.load_settings")
    def test_transcribe_speech_audio_collects_continuous_segments(
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
            speech_endpoint="https://speech.example.com/",
            speech_key=None,
            speech_transcription_model="MAI-Transcribe-1.5",
        )

        recognized_signal = MagicMock()
        stopped_signal = MagicMock()
        canceled_signal = MagicMock()
        recognizer = MagicMock()
        recognizer.recognized = recognized_signal
        recognizer.session_stopped = stopped_signal
        recognizer.canceled = canceled_signal

        def start_recognition() -> None:
            recognized = recognized_signal.connect.call_args.args[0]
            stopped = stopped_signal.connect.call_args.args[0]
            recognized(SimpleNamespace(result=SimpleNamespace(reason="recognized", text="Hello.")))
            recognized(SimpleNamespace(result=SimpleNamespace(reason="recognized", text="World.")))
            stopped(None)

        recognizer.start_continuous_recognition.side_effect = start_recognition
        speechsdk = ModuleType("azure.cognitiveservices.speech")
        speechsdk.SpeechConfig = MagicMock()
        speechsdk.SpeechRecognizer = MagicMock(return_value=recognizer)
        speechsdk.ResultReason = SimpleNamespace(RecognizedSpeech="recognized")
        speechsdk.CancellationReason = SimpleNamespace(Error="error")
        speechsdk.audio = SimpleNamespace(AudioConfig=MagicMock())
        cognitive_services = ModuleType("azure.cognitiveservices")
        cognitive_services.speech = speechsdk

        with patch.dict(
            sys.modules,
            {
                "azure.cognitiveservices": cognitive_services,
                "azure.cognitiveservices.speech": speechsdk,
            },
        ):
            result = transcribe_speech_audio(audio=b"RIFF-test", language="en-US")

        self.assertEqual(result["text"], "Hello. World.")
        self.assertEqual(result["segments"], ["Hello.", "World."])
        self.assertEqual(result["model"], "MAI-Transcribe-1.5")
        speechsdk.SpeechConfig.assert_called_once_with(
            token_credential=get_credential.return_value,
            endpoint="https://speech.example.com/",
        )


if __name__ == "__main__":
    unittest.main()
