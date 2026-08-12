import unittest
from unittest import mock

from app.application.use_case_settings import resolve_foundry_binding
from usecases_media.shared.voice.backend.live_interpreter import (
    TARGET_LANGUAGE_PATTERN,
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
        with self.assertRaisesRegex(ValueError, "absolute resource endpoint"):
            build_live_interpreter_endpoint("example.cognitiveservices.azure.com")

    def test_target_language_format_accepts_translation_codes(self) -> None:
        self.assertIsNotNone(TARGET_LANGUAGE_PATTERN.fullmatch("zh-Hans"))
        self.assertIsNone(TARGET_LANGUAGE_PATTERN.fullmatch("../../fr"))

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
