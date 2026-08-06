from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import create_app


def test_realtime_session_contract(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    session = {"token": "secret", "model": "realtime", "voice": "alloy"}
    with patch("app.features.voice.router.create_realtime_client_secret", return_value=session):
        response = TestClient(create_app()).post(
            "/api/realtime/session",
            json={"model": "realtime", "instructions": "Be concise", "voice": "alloy"},
        )
    assert response.status_code == 200
    assert response.json()["guardrail_comparison_available"] is False
    assert response.json()["model"] == "realtime"


def test_transcription_upload_limit(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    monkeypatch.setattr("app.features.voice.router.MAX_AUDIO_BYTES", 4)
    response = TestClient(create_app()).post(
        "/api/transcriptions",
        data={"model": "transcribe"},
        files={"audio": ("audio.wav", b"xxxxx", "audio/wav")},
    )
    assert response.status_code == 413


def test_transcription_provider_error_is_sanitized(monkeypatch):
    monkeypatch.setenv("APP_AUTH_MODE", "disabled")
    with patch("app.features.voice.router.transcribe_audio", side_effect=RuntimeError("provider secret")):
        with patch("app.features.voice.router.load_settings") as settings:
            settings.return_value.speech_transcription_model = "mai"
            response = TestClient(create_app(), raise_server_exceptions=False).post(
                "/api/transcriptions",
                data={"model": "gpt-transcribe"},
                files={"audio": ("audio.wav", b"RIFF", "audio/wav")},
            )
    assert response.status_code == 502
    assert response.json() == {"detail": "Audio transcription failed. Try again later."}
    assert "provider secret" not in response.text
