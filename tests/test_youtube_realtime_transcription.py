import asyncio
import json
import sys
from unittest.mock import patch

import pytest

from app.core.errors import ExternalServiceError, InvalidRequestError
from usecases_media.youtube_realtime_transcription.backend.router import (
    YOUTUBE_COMMIT_BYTES,
    TranscriptionProxyState,
    _ffmpeg_pcm_command,
    _probe_youtube_video,
    _relay_transcripts_to_browser,
    _relay_youtube_audio,
    _stream_youtube_pcm24_with_popen,
    _youtube_audio_download_command,
    _youtube_audio_pipeline_exception,
    _youtube_realtime_error_message,
    _youtube_realtime_options,
    _ytdlp_cookie_arguments,
    stream_youtube_pcm24,
)


class FakeWebSocket:
    def __init__(self, query_params):
        self.query_params = query_params


class FakeJsonWebSocket:
    def __init__(self):
        self.sent: list[dict] = []

    async def send_json(self, event: dict) -> None:
        self.sent.append(event)


class FakeUpstream:
    def __init__(self, events: list[dict] | None = None):
        self.sent: list[dict] = []
        self.events = list(events or [])

    async def send(self, message: str) -> None:
        self.sent.append(json.loads(message))

    def __aiter__(self):
        return self

    async def __anext__(self) -> str:
        if not self.events:
            raise StopAsyncIteration
        return json.dumps(self.events.pop(0))


def test_youtube_realtime_options_require_url_and_model():
    with pytest.raises(InvalidRequestError, match="Enter a YouTube URL"):
        _youtube_realtime_options(FakeWebSocket({"model": "gpt-live-transcribe"}))

    with pytest.raises(InvalidRequestError, match="Select a realtime transcription model"):
        _youtube_realtime_options(FakeWebSocket({"url": "https://youtu.be/dQw4w9WgXcQ"}))


def test_youtube_realtime_options_trim_values():
    assert _youtube_realtime_options(
        FakeWebSocket(
            {
                "url": " https://youtu.be/dQw4w9WgXcQ ",
                "model": " gpt-live-transcribe ",
                "language": "en",
                "delay": "low",
            }
        )
    ) == ("https://youtu.be/dQw4w9WgXcQ", "en", "low", "gpt-live-transcribe")


def test_youtube_realtime_error_message_preserves_invalid_request_detail():
    message = _youtube_realtime_error_message(
        InvalidRequestError(
            "Audio fallback is not installed locally. Install the yt-dlp 2026.07.04 "
            "GitHub tag in the Python environment running FastAPI."
        )
    )

    assert "Install the yt-dlp 2026.07.04 GitHub tag" in message


def test_youtube_realtime_error_message_preserves_sanitized_application_errors():
    assert (
        _youtube_realtime_error_message(ExternalServiceError("YouTube audio conversion"))
        == "YouTube audio conversion failed. Try again later."
    )


def test_youtube_realtime_probe_rejects_long_videos():
    with (
        patch(
            "usecases_media.youtube_realtime_transcription.backend.router._ensure_ytdlp_available"
        ),
        patch("usecases_media.youtube_realtime_transcription.backend.router.subprocess.run") as run,
    ):
        run.return_value.stdout = '{"duration": 3601}'
        with pytest.raises(InvalidRequestError, match="up to 30 minutes"):
            _probe_youtube_video("dQw4w9WgXcQ")

    arguments = run.call_args.args[0]
    assert "--skip-download" in arguments
    assert "--dump-single-json" in arguments


def test_youtube_audio_download_command_streams_media_to_stdout():
    with patch(
        "usecases_media.youtube_realtime_transcription.backend.router._ensure_ytdlp_available"
    ):
        arguments = _youtube_audio_download_command("dQw4w9WgXcQ")

    assert "--output" in arguments
    assert arguments[arguments.index("--output") + 1] == "-"
    assert "--get-url" not in arguments
    assert "https://www.youtube.com/watch?v=dQw4w9WgXcQ" in arguments


def test_youtube_audio_download_command_includes_optional_cookie_file(monkeypatch):
    monkeypatch.setenv("YOUTUBE_COOKIES_FILE", "C:/secure/cookies.txt")
    with patch(
        "usecases_media.youtube_realtime_transcription.backend.router._ensure_ytdlp_available"
    ):
        arguments = _youtube_audio_download_command("dQw4w9WgXcQ")

    assert _ytdlp_cookie_arguments() == ["--cookies", "C:/secure/cookies.txt"]
    assert arguments[arguments.index("--cookies") + 1] == "C:/secure/cookies.txt"


def test_youtube_audio_pipeline_exception_explains_403_cookie_requirement():
    exc = _youtube_audio_pipeline_exception(
        "ERROR: unable to download video data: HTTP Error 403: Forbidden"
    )

    assert isinstance(exc, InvalidRequestError)
    assert "YOUTUBE_COOKIES_FILE" in exc.detail
    assert "HTTP 403" in exc.detail


def test_ffmpeg_pcm_command_decodes_stdin_to_realtime_pcm_stdout():
    arguments = _ffmpeg_pcm_command("ffmpeg")

    assert arguments[:7] == [
        "ffmpeg",
        "-nostdin",
        "-loglevel",
        "error",
        "-re",
        "-i",
        "pipe:0",
    ]
    assert "-f" in arguments
    assert "s16le" in arguments
    assert "-ar" in arguments
    assert arguments[arguments.index("-ar") + 1] == "24000"
    assert "-ac" in arguments
    assert arguments[arguments.index("-ac") + 1] == "1"
    assert arguments[-1] == "pipe:1"


def test_stream_youtube_pcm24_uses_threaded_pipeline_when_asyncio_subprocess_unavailable():
    async def fallback(video_id: str, ffmpeg: str):
        assert video_id == "dQw4w9WgXcQ"
        assert ffmpeg == "ffmpeg"
        yield b"pcm"

    async def collect() -> list[bytes]:
        with (
            patch(
                "usecases_media.youtube_realtime_transcription.backend.router._probe_youtube_video"
            ),
            patch(
                "usecases_media.youtube_realtime_transcription.backend.router._ffmpeg_executable",
                return_value="ffmpeg",
            ),
            patch(
                "usecases_media.youtube_realtime_transcription.backend.router.asyncio.create_subprocess_exec",
                side_effect=NotImplementedError,
            ) as create_subprocess,
            patch(
                "usecases_media.youtube_realtime_transcription.backend.router._stream_youtube_pcm24_with_popen",
                fallback,
            ),
        ):
            chunks = [chunk async for chunk in stream_youtube_pcm24("dQw4w9WgXcQ")]

        create_subprocess.assert_called_once()
        return chunks

    assert asyncio.run(collect()) == [b"pcm"]


def test_threaded_youtube_pcm_pipeline_streams_without_asyncio_subprocesses():
    async def collect() -> list[bytes]:
        with (
            patch(
                "usecases_media.youtube_realtime_transcription.backend.router._youtube_audio_download_command",
                return_value=[
                    sys.executable,
                    "-c",
                    "import sys; sys.stdout.buffer.write(b'audio'); sys.stdout.flush()",
                ],
            ),
            patch(
                "usecases_media.youtube_realtime_transcription.backend.router._ffmpeg_pcm_command",
                return_value=[
                    sys.executable,
                    "-c",
                    "import sys; data = sys.stdin.buffer.read(); sys.stdout.buffer.write(b'pcm:' + data); sys.stdout.flush()",
                ],
            ),
        ):
            return [
                chunk async for chunk in _stream_youtube_pcm24_with_popen("dQw4w9WgXcQ", "ffmpeg")
            ]

    assert asyncio.run(collect()) == [b"pcm:audio"]


def test_relay_youtube_audio_commits_fixed_streaming_windows():
    async def pcm_audio():
        yield b"\0" * YOUTUBE_COMMIT_BYTES

    async def relay() -> tuple[list[dict], list[dict]]:
        upstream = FakeUpstream()
        websocket = FakeJsonWebSocket()
        await _relay_youtube_audio(
            upstream=upstream,
            websocket=websocket,
            state=TranscriptionProxyState(),
            pcm_audio=pcm_audio(),
        )
        return upstream.sent, websocket.sent

    upstream_events, browser_events = asyncio.run(relay())

    event_types = [event["type"] for event in upstream_events]
    assert event_types.count("input_audio_buffer.append") == 6
    assert event_types[-1] == "input_audio_buffer.commit"
    assert browser_events[-1] == {"type": "youtube.completed"}


def test_relay_transcripts_forwards_transcription_result_variants():
    async def relay() -> list[dict]:
        websocket = FakeJsonWebSocket()
        await _relay_transcripts_to_browser(
            upstream=FakeUpstream(
                [
                    {"type": "response.text.done", "text": "hello"},
                    {
                        "type": "conversation.item.input_audio_transcription.failed",
                        "item_id": "item-1",
                        "error": {"message": "bad audio"},
                    },
                ]
            ),
            websocket=websocket,
            state=TranscriptionProxyState(),
        )
        return websocket.sent

    assert asyncio.run(relay()) == [
        {"type": "response.text.done", "text": "hello"},
        {
            "type": "conversation.item.input_audio_transcription.failed",
            "item_id": "item-1",
            "error": {"message": "bad audio"},
            "sequence": 1,
        },
    ]
