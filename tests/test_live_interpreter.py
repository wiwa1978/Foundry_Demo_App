import asyncio
import unittest
from types import SimpleNamespace
from unittest import mock

from app.application.use_case_settings import FoundryBinding, resolve_foundry_binding
from usecases_media.shared.voice.backend.live_interpreter import (
    TARGET_LANGUAGE_PATTERN,
    LiveInterpreterSession,
    build_live_interpreter_endpoint,
)


class LiveInterpreterEndpointTests(unittest.TestCase):
    def test_builds_v2_websocket_endpoint_from_resource_root(self) -> None:
        endpoint = build_live_interpreter_endpoint("https://example.cognitiveservices.azure.com/")

        self.assertEqual(
            endpoint,
            "wss://example.cognitiveservices.azure.com/stt/speech/universal/v2",
        )

    def test_discards_existing_resource_path(self) -> None:
        endpoint = build_live_interpreter_endpoint(
            "https://example.cognitiveservices.azure.com/speech/recognition"
        )

        self.assertEqual(
            endpoint,
            "wss://example.cognitiveservices.azure.com/stt/speech/universal/v2",
        )

    def test_rejects_relative_endpoint(self) -> None:
        with self.assertRaisesRegex(ValueError, "absolute HTTPS endpoint"):
            build_live_interpreter_endpoint("example.cognitiveservices.azure.com")

    def test_rejects_insecure_endpoint(self) -> None:
        with self.assertRaisesRegex(ValueError, "absolute HTTPS endpoint"):
            build_live_interpreter_endpoint("http://example.cognitiveservices.azure.com")

    def test_target_language_format_accepts_translation_codes(self) -> None:
        self.assertIsNotNone(TARGET_LANGUAGE_PATTERN.fullmatch("zh-Hans"))
        self.assertIsNone(TARGET_LANGUAGE_PATTERN.fullmatch("../../fr"))

    def test_rejects_standard_translation_to_same_language_family(self) -> None:
        binding = FoundryBinding(
            name="TEST",
            project_endpoint="https://demo.services.ai.azure.com/api/projects/demo",
            models=(),
            speech_endpoint="https://demo.cognitiveservices.azure.com",
            speech_key="test-key",
            region=None,
        )

        with self.assertRaisesRegex(ValueError, "different from the source"):
            LiveInterpreterSession(
                binding=binding,
                mode="standard",
                source_language="en-US",
                target_language="en",
                loop=mock.Mock(),
            )


    def test_interim_translation_emits_partial_text_immediately(self) -> None:
        loop = asyncio.new_event_loop()
        try:
            session = LiveInterpreterSession.__new__(LiveInterpreterSession)
            session._speechsdk = SimpleNamespace(
                ResultReason=SimpleNamespace(TranslatingSpeech="translating")
            )
            session._target_language = "fr"
            session._mode = "standard"
            session._loop = loop
            session._closed = False
            session.events = asyncio.Queue()

            session._recognizing(
                SimpleNamespace(
                    result=SimpleNamespace(
                        reason="translating",
                        translations={"fr": "Bon"},
                        text="Good",
                    )
                )
            )
            loop.run_until_complete(asyncio.sleep(0))

            self.assertEqual(
                loop.run_until_complete(session.events.get()),
                (
                    "json",
                    {
                        "type": "partial_translation",
                        "text": "Bon",
                        "source_text": "Good",
                        "target_language": "fr",
                        "detected_language": None,
                    },
                ),
            )
        finally:
            loop.close()

    def test_standard_translation_emits_translated_text_and_synthesized_audio(self) -> None:
        loop = asyncio.new_event_loop()
        try:
            session = LiveInterpreterSession.__new__(LiveInterpreterSession)
            session._speechsdk = SimpleNamespace(
                ResultReason=SimpleNamespace(TranslatedSpeech="translated")
            )
            session._target_language = "fr"
            session._mode = "standard"
            session._standard_synthesizer = mock.Mock()
            session._standard_synthesizer.speak_text_async.return_value.get.return_value = (
                SimpleNamespace(audio_data=b"pcm-audio")
            )
            session._loop = loop
            session._closed = False
            session.events = asyncio.Queue()

            session._recognized(
                SimpleNamespace(
                    result=SimpleNamespace(
                        reason="translated",
                        translations={"fr": "Bonjour"},
                        text="Hello",
                    )
                )
            )
            loop.run_until_complete(asyncio.sleep(0))

            self.assertEqual(
                loop.run_until_complete(session.events.get()),
                (
                    "json",
                    {
                        "type": "translation",
                        "text": "Bonjour",
                        "source_text": "Hello",
                        "target_language": "fr",
                        "detected_language": None,
                    },
                ),
            )
            self.assertEqual(
                loop.run_until_complete(session.events.get()),
                ("bytes", b"pcm-audio"),
            )
            session._standard_synthesizer.speak_text_async.assert_called_once_with(
                "Bonjour"
            )
        finally:
            loop.close()

    def test_standard_translation_reports_empty_synthesized_audio(self) -> None:
        loop = asyncio.new_event_loop()
        try:
            session = LiveInterpreterSession.__new__(LiveInterpreterSession)
            session._standard_synthesizer = mock.Mock()
            session._standard_synthesizer.speak_text_async.return_value.get.return_value = (
                SimpleNamespace(audio_data=b"")
            )
            session._loop = loop
            session._closed = False
            session.events = asyncio.Queue()

            session._synthesize_standard_translation("Bonjour")
            loop.run_until_complete(asyncio.sleep(0))

            self.assertEqual(
                loop.run_until_complete(session.events.get()),
                (
                    "json",
                    {
                        "type": "error",
                        "error": "Azure Speech synthesis produced no audio.",
                    },
                ),
            )
        finally:
            loop.close()

    def test_resolves_dynamic_foundry_binding(self) -> None:
        with mock.patch.dict(
            "os.environ",
            {
                "REGION2": "eastus",
                "FOUNDRY_PROJECT_ENDPOINT_REGION2": (
                    "https://speech-east.services.ai.azure.com/api/projects/demo"
                ),
                "FOUNDRY_MODELS_REGION2": "gpt-5.5, gpt-4o-mini",
            },
        ):
            binding = resolve_foundry_binding("region2")

        self.assertEqual(binding.name, "REGION2")
        self.assertEqual(binding.region, "eastus")
        self.assertEqual(binding.models, ("gpt-5.5", "gpt-4o-mini"))
        self.assertEqual(
            binding.speech_endpoint,
            "https://speech-east.cognitiveservices.azure.com",
        )


if __name__ == "__main__":
    unittest.main()
