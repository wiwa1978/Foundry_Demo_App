import asyncio
import threading
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import create_app
from app.persistence import reset_repositories


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
        "app.features.voice.websockets.create_voice_live_connection_info",
        return_value={"url": "wss://voice.example", "token": "token"},
    ):
        with patch(
            "app.features.voice.websockets.websocket_connect",
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


def test_live_interpreter_websocket_starts_writes_audio_and_closes(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    monkeypatch.setenv("PERSISTENCE_BACKEND", "sqlite")
    monkeypatch.setenv("SQLITE_DATABASE_PATH", str(tmp_path / "websocket.sqlite3"))
    reset_repositories()
    session = FakeInterpreterSession()
    try:
        with patch(
            "app.features.voice.websockets.LiveInterpreterSession",
            return_value=session,
        ):
            # Entering TestClient runs the application lifespan and initializes persistence.
            with TestClient(create_app()) as client:
                with client.websocket_connect(
                    "/api/live-interpreter",
                    headers={"origin": "http://testserver"},
                ) as websocket:
                    websocket.send_json({"type": "start", "target_language": "fr"})
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
