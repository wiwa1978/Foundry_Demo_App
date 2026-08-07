from dataclasses import dataclass

from app.config import env_csv, first_env
from app.model_settings import list_models


@dataclass(frozen=True)
class FoundrySettings:
    endpoint: str | None
    models: list[str]
    realtime_endpoint: str | None
    realtime_model: str
    embedding_model: str
    transcription_model: str
    tts_model: str
    tts_voice: str
    speech_endpoint: str | None
    speech_key: str | None
    speech_transcription_model: str
    voice_live_endpoint: str | None = None
    voice_live_model: str = "gpt-realtime"
    voice_live_voice: str = "en-US-Ava:DragonHDLatestNeural"

    @property
    def is_configured(self) -> bool:
        return bool(self.endpoint)

    @property
    def is_realtime_configured(self) -> bool:
        return bool(self.realtime_endpoint and self.realtime_model)

    @property
    def is_traditional_voice_configured(self) -> bool:
        return bool(self.endpoint and self.transcription_model and self.tts_model)

    @property
    def is_speech_transcription_configured(self) -> bool:
        return bool(self.speech_endpoint)

    @property
    def is_voice_live_configured(self) -> bool:
        return bool(self.voice_live_endpoint and self.voice_live_model)

    @property
    def is_live_interpreter_configured(self) -> bool:
        return bool(self.speech_endpoint)

    @property
    def auth_mode(self) -> str:
        return "entra_id"


def load_settings() -> FoundrySettings:
    seed_models = env_csv("FOUNDRY_MODELS")
    models = list_models(seed_models)
    realtime_model = (
        first_env("FOUNDRY_REALTIME_MODEL")
        or next((model for model in models if "realtime" in model.lower()), None)
        or "gpt-realtime-2.1"
    )

    return FoundrySettings(
        endpoint=first_env(
            "FOUNDRY_PROJECT_ENDPOINT",
            "AZURE_AI_PROJECT_ENDPOINT",
            "AZURE_AIPROJECT_ENDPOINT",
            "FOUNDRY_ENDPOINT",
            "FOUNDRY_OPENAI_ENDPOINT",
            "AZURE_OPENAI_ENDPOINT",
        ),
        models=models,
        realtime_endpoint=first_env(
            "FOUNDRY_REALTIME_ENDPOINT",
            "AZURE_OPENAI_ENDPOINT",
            "FOUNDRY_OPENAI_ENDPOINT",
            "FOUNDRY_PROJECT_ENDPOINT",
            "AZURE_AI_PROJECT_ENDPOINT",
            "AZURE_AIPROJECT_ENDPOINT",
            "FOUNDRY_ENDPOINT",
        ),
        realtime_model=realtime_model,
        embedding_model=first_env(
            "FOUNDRY_EMBEDDING_MODEL", default="text-embedding-3-small"
        )
        or "text-embedding-3-small",
        transcription_model=first_env(
            "FOUNDRY_TRANSCRIPTION_MODEL",
            "AZURE_OPENAI_TRANSCRIPTION_MODEL",
            default="gpt-4o-mini-transcribe",
        )
        or "gpt-4o-mini-transcribe",
        tts_model=first_env(
            "FOUNDRY_TTS_MODEL",
            "AZURE_OPENAI_TTS_MODEL",
            default="gpt-4o-mini-tts",
        )
        or "gpt-4o-mini-tts",
        tts_voice=first_env("FOUNDRY_TTS_VOICE", default="alloy") or "alloy",
        speech_endpoint=first_env("AZURE_SPEECH_ENDPOINT"),
        speech_key=first_env("AZURE_SPEECH_KEY"),
        speech_transcription_model=first_env(
            "AZURE_SPEECH_TRANSCRIPTION_MODEL", default="MAI-Transcribe-1.5"
        )
        or "MAI-Transcribe-1.5",
        voice_live_endpoint=first_env("AZURE_VOICELIVE_ENDPOINT", "AZURE_SPEECH_ENDPOINT"),
        voice_live_model=first_env("AZURE_VOICELIVE_MODEL", default="gpt-realtime")
        or "gpt-realtime",
        voice_live_voice=first_env(
            "AZURE_VOICELIVE_VOICE", default="en-US-Ava:DragonHDLatestNeural"
        )
        or "en-US-Ava:DragonHDLatestNeural",
    )
