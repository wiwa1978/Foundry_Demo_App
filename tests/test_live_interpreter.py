import unittest

from app.live_interpreter import TARGET_LANGUAGE_PATTERN, build_live_interpreter_endpoint


class LiveInterpreterEndpointTests(unittest.TestCase):
    def test_builds_v2_websocket_endpoint_from_resource_root(self) -> None:
        endpoint = build_live_interpreter_endpoint(
            "https://example.cognitiveservices.azure.com/"
        )

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


if __name__ == "__main__":
    unittest.main()
