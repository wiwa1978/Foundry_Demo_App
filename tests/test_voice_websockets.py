import asyncio
import base64
import json
import threading
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.infrastructure.persistence.registry import reset_repositories
from app.main import create_app


class FakeUpstream:
    def __init__(self) -> None:
        self.sent: list[str | bytes] = []
        self.browser_message_received = threading.Event()
        self._yielded = False

    async def send(self, message: str | bytes) -> None:
        self.sent.append(message)
        self.browser_message_received.set()

    def __aiter__(self):
        return self

    async def __anext__(self) -> str:
        if not self._yielded:
            self._yielded = True
            return '{"type":"ready"}'
        await asyncio.Event().wait()
        raise StopAsyncIteration

    async def recv(self) -> str:
        return await self.__anext__()


class FakeTranscriptionUpstream(FakeUpstream):
    def __init__(self) -> None:
        super().__init__()
        self.audio_received = threading.Event()

    async def send(self, message: str | bytes) -> None:
        await super().send(message)
        if isinstance(message, str) and "input_audio_buffer.append" in message:
            self.audio_received.set()

    async def __anext__(self) -> str:
        if not self._yielded:
            self._yielded = True
            return json.dumps(
                {
                    "type": "conversation.item.input_audio_transcription.delta",
                    "item_id": "item-1",
                    "delta": "Hello",
                }
            )
        await asyncio.Event().wait()
        raise StopAsyncIteration


class FakeTranslationUpstream(FakeUpstream):
    def __init__(self) -> None:
        super().__init__()
        self.audio_received = threading.Event()
        self.close_received = threading.Event()
        self.events = [
            {"type": "session.created"},
            {"type": "session.updated"},
            {
                "type": "session.input_transcript.done",
                "text": "Hello",
            },
            {"type": "translation.delta", "delta": "Bonjour"},
            {
                "type": "response.output_audio.delta",
                "delta": base64.b64encode(b"audio").decode("ascii"),
                "sample_rate": 24000,
                "channels": 1,
                "format": "pcm16",
            },
        ]

    async def send(self, message: str | bytes) -> None:
        await super().send(message)
        if isinstance(message, str) and "session.input_audio_buffer.append" in message:
            self.audio_received.set()
        if isinstance(message, str) and '"session.close"' in message:
            self.close_received.set()

    async def __anext__(self) -> str:
        if self.events:
            return json.dumps(self.events.pop(0))
        if self.close_received.is_set():
            return json.dumps({"type": "session.closed"})
        await asyncio.sleep(0.01)
        return await self.__anext__()


class FakeConnection:
    def __init__(self, upstream: FakeUpstream) -> None:
        self.upstream = upstream

    async def __aenter__(self) -> FakeUpstream:
        return self.upstream

    async def __aexit__(self, exc_type, exc, traceback) -> bool:
        return False


class FakeInterpreterSession:
    def __init__(self) -> None:
        self.events: asyncio.Queue = asyncio.Queue()
        self.writes: list[bytes] = []
        self.audio_received = threading.Event()
        self.closed = threading.Event()

    async def start(self) -> None:
        return None

    def write(self, audio: bytes) -> None:
        self.writes.append(audio)
        self.audio_received.set()

    async def close(self) -> None:
        self.closed.set()


def test_voice_live_websocket_relays_messages(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    upstream = FakeUpstream()
    with patch(
        "usecases_media.shared.voice.backend.websockets.create_voice_live_connection_info",
        return_value={"url": "wss://voice.example", "token": "token"},
    ):
        with patch(
            "usecases_media.shared.voice.backend.websockets.websocket_connect",
            return_value=FakeConnection(upstream),
        ):
            with TestClient(create_app()).websocket_connect(
                "/api/voice-live",
                subprotocols=["realtime"],
                headers={"origin": "http://testserver"},
            ) as websocket:
                assert websocket.accepted_subprotocol == "realtime"
                assert websocket.receive_text() == '{"type":"ready"}'
                websocket.send_text('{"type":"input_audio"}')
                assert upstream.browser_message_received.wait(timeout=1)

    assert upstream.sent == ['{"type":"input_audio"}']


def test_realtime_transcription_websocket_wraps_pcm_and_relays_transcript(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    upstream = FakeTranscriptionUpstream()
    connection = {
        "url": "wss://realtime.example/openai/v1/realtime?intent=transcription",
        "token": "token",
        "model": "gpt-live-transcribe",
        "session_update": {"type": "session.update", "session": {"type": "transcription"}},
    }
    with (
        patch(
            "usecases_media.shared.voice.backend.websockets.create_realtime_transcription_connection_info",
            return_value=connection,
        ) as create_connection,
        patch(
            "usecases_media.shared.voice.backend.websockets.websocket_connect",
            return_value=FakeConnection(upstream),
        ),
    ):
        with TestClient(create_app()).websocket_connect(
            "/api/realtime-transcription?model=gpt-live-transcribe&language=nl&delay=low&turnDetection=none",
            headers={"origin": "http://testserver"},
        ) as websocket:
            assert websocket.receive_json() == {
                "type": "ready",
                "model": "gpt-live-transcribe",
                "input_rate": 24000,
            }
            assert websocket.receive_json()["delta"] == "Hello"
            websocket.send_bytes(b"pcm")
            assert upstream.audio_received.wait(timeout=1)

    assert json.loads(str(upstream.sent[0]))["type"] == "session.update"
    append = json.loads(str(upstream.sent[1]))
    assert append == {
        "type": "input_audio_buffer.append",
        "audio": base64.b64encode(b"pcm").decode("ascii"),
    }

    create_connection.assert_called_once_with(
        model="gpt-live-transcribe",
        language="nl",
        delay="low",
        turn_detection="none",
    )


def test_realtime_translation_websocket_relays_pcm_text_and_audio(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    upstream = FakeTranslationUpstream()
    connection = {
        "url": "wss://realtime.example/openai/v1/realtime/translations?model=translate",
        "token": "token",
        "model": "gpt-realtime-translate",
        "transcription_model": "gpt-realtime-whisper",
        "session_update": {"type": "session.update", "session": {}},
    }
    with (
        patch(
            "usecases_media.shared.voice.backend.websockets.create_realtime_translation_connection_info",
            return_value=connection,
        ) as create_connection,
        patch(
            "usecases_media.shared.voice.backend.websockets.websocket_connect",
            return_value=FakeConnection(upstream),
        ) as connect,
    ):
        with TestClient(create_app()).websocket_connect(
            "/api/realtime-translation"
            "?targetLanguage=fr&sourceLanguage=en&model=gpt-realtime-translate-preview"
            "&transcriptionModel=gpt-realtime-whisper",
            headers={"origin": "http://testserver"},
        ) as websocket:
            assert websocket.receive_json()["type"] == "session.created"
            assert websocket.receive_json()["model"] == "gpt-realtime-translate"
            assert websocket.receive_json()["text"] == "Hello"
            assert websocket.receive_json()["delta"] == "Bonjour"
            assert websocket.receive_json()["sample_rate"] == 24000
            websocket.send_bytes(b"pcm")
            assert upstream.audio_received.wait(timeout=1)
            websocket.send_json({"type": "stop"})

    append = next(
        json.loads(str(message))
        for message in upstream.sent
        if "session.input_audio_buffer.append" in str(message)
    )
    assert append == {
        "type": "session.input_audio_buffer.append",
        "audio": base64.b64encode(b"pcm").decode("ascii"),
    }
    assert upstream.close_received.wait(timeout=1)
    create_connection.assert_called_once_with(
        target_language="fr",
        source_language="en",
        model="gpt-realtime-translate-preview",
        transcription_model="gpt-realtime-whisper",
    )
    connect.assert_called_once_with(
        connection["url"],
        additional_headers={
            "Authorization": "Bearer token",
            "openai-alpha": "translation=v1",
        },
        max_size=None,
    )


def test_live_interpreter_websocket_starts_writes_audio_and_closes(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    monkeypatch.setenv("PERSISTENCE_BACKEND", "sqlite")
    monkeypatch.setenv("SQLITE_DATABASE_PATH", str(tmp_path / "websocket.sqlite3"))
    reset_repositories()
    monkeypatch.setenv(
        "FOUNDRY_PROJECT_ENDPOINT_REGION2",
        "https://speech-east.services.ai.azure.com/api/projects/demo",
    )
    from app.application.use_case_settings import save_use_case_binding
    from app.infrastructure.persistence.registry import get_repositories, initialize_persistence

    initialize_persistence()
    save_use_case_binding(
        get_repositories().use_case_settings,
        "live_translation",
        "REGION2",
    )
    session = FakeInterpreterSession()
    try:
        with patch(
            "usecases_media.shared.voice.backend.websockets.LiveInterpreterSession",
            return_value=session,
        ):
            # Entering TestClient runs the application lifespan and initializes persistence.
            with TestClient(create_app()) as client:
                with client.websocket_connect(
                    "/api/live-interpreter",
                    headers={"origin": "http://testserver"},
                ) as websocket:
                    websocket.send_json(
                        {
                            "type": "start",
                            "mode": "standard",
                            "source_language": "en-US",
                            "target_language": "fr",
                        }
                    )
                    assert websocket.receive_json() == {
                        "type": "ready",
                        "input_format": "pcm_s16le_16000_mono",
                        "output_format": "pcm_s16le_16000_mono",
                    }
                    websocket.send_bytes(b"pcm")
                    assert session.audio_received.wait(timeout=1)
                    websocket.send_json({"type": "stop"})
    finally:
        reset_repositories()

    assert session.writes == [b"pcm"]
    assert session.closed.wait(timeout=1)
