from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import create_app


def test_realtime_session_contract(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    session = {
        "token": "secret",
        "webrtc_url": "https://example.test/realtime",
        "model": "realtime",
        "voice": "alloy",
    }
    with patch("usecases_media.shared.voice.backend.router.create_realtime_client_secret", return_value=session):
        response = TestClient(create_app()).post(
            "/api/realtime/session",
            json={"model": "realtime", "instructions": "Be concise", "voice": "alloy"},
        )
    assert response.status_code == 200
    assert response.json() == {
        **session,
        "guardrail_comparison_available": False,
        "configured_guardrail_policy_name": None,
        "guardrail_status": "Realtime uses the deployment-assigned policy.",
    }


def test_realtime_transcription_session_contract(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    session = {
        "token": "secret",
        "webrtc_url": "https://example.test/realtime/calls",
        "model": "gpt-realtime-whisper",
    }
    with patch(
        "usecases_media.shared.voice.backend.router.create_realtime_transcription_client_secret",
        return_value=session,
    ):
        response = TestClient(create_app()).post(
            "/api/realtime-transcription/session",
            json={"language": "nl", "delay": "low", "turn_detection": "semantic_vad"},
        )

    assert response.status_code == 200
    assert response.json() == session


def test_transcription_upload_limit(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    monkeypatch.setattr("usecases_media.shared.voice.backend.router.MAX_AUDIO_BYTES", 4)
    response = TestClient(create_app()).post(
        "/api/transcriptions",
        data={"model": "transcribe"},
        files={"audio": ("audio.wav", b"xxxxx", "audio/wav")},
    )
    assert response.status_code == 413


def test_transcription_provider_error_is_sanitized(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    with patch("usecases_media.shared.voice.backend.router.transcribe_audio", side_effect=RuntimeError("provider secret")):
        with patch("usecases_media.shared.voice.backend.router.load_settings") as settings:
            settings.return_value.speech_transcription_model = "mai"
            response = TestClient(create_app(), raise_server_exceptions=False).post(
                "/api/transcriptions",
                data={"model": "gpt-transcribe"},
                files={"audio": ("audio.wav", b"RIFF", "audio/wav")},
            )
    assert response.status_code == 502
    assert response.json() == {
        "detail": "Audio transcription failed. Try again later.",
        "code": "external_service_error",
    }
    assert "provider secret" not in response.text


def test_traditional_voice_route_delegates_to_service(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    process = AsyncMock(
        return_value={
            "model": "chat",
            "transcription": {
                "model": "transcribe",
                "text": "hello",
                "duration_ms": 5,
            },
            "results": [],
            "conversation": {
                "id": "conversation-1",
                "title": "hello",
                "use_case": "traditional_voice",
                "created_at": "2026-01-01T00:00:00+00:00",
                "updated_at": "2026-01-01T00:00:00+00:00",
            },
            "user_message": {
                "id": "message-1",
                "conversation_id": "conversation-1",
                "role": "user",
                "content": "hello",
                "model": None,
                "api_surface": None,
                "duration_ms": None,
                "error": None,
                "usage": None,
                "guardrail_variant": None,
                "guardrail_policy_name": None,
                "guardrail_results": None,
                "created_at": "2026-01-01T00:00:00+00:00",
            },
        }
    )
    with patch("usecases_media.shared.voice.backend.router.traditional_voice_service.process", process):
        response = TestClient(create_app()).post(
            "/api/voice/traditional",
            data={"model": "chat", "reasoning_effort": "low"},
            files={"audio": ("recording.webm", b"audio", "audio/webm")},
        )

    assert response.status_code == 200
    assert response.json()["transcription"]["text"] == "hello"
    assert process.await_args is not None
    assert process.await_args.kwargs["audio"] == b"audio"
    assert process.await_args.kwargs["reasoning_effort"] == "low"
