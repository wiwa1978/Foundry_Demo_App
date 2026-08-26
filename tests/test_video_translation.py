import unittest

from app.core.errors import ExternalServiceError
from usecases_media.video_translation.backend.service import _caption_formats


class MediaTranslationTests(unittest.TestCase):
    def test_caption_formats_include_timed_webvtt_and_srt(self) -> None:
        webvtt, srt, cues = _caption_formats(
            [
                {"text": "Hello world.", "offset_ms": 1250, "duration_ms": 1800},
                {"text": "Second phrase.", "offset_ms": 3400, "duration_ms": 900},
            ]
        )

        self.assertEqual(cues[0]["start_ms"], 1250)
        self.assertIn("WEBVTT", webvtt)
        self.assertIn("00:00:01.250 --> 00:00:03.050", webvtt)
        self.assertIn("00:00:01,250 --> 00:00:03,050", srt)
        self.assertIn("Hello world.", srt)

    def test_caption_formats_reject_empty_timing_segments(self) -> None:
        with self.assertRaises(ExternalServiceError):
            _caption_formats([{"text": "  ", "offset_ms": 0, "duration_ms": 1}])


if __name__ == "__main__":
    unittest.main()
