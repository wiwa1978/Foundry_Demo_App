from dataclasses import dataclass, field
from urllib.parse import urlparse

from app.core.config import env_csv, first_env

AI_SERVICES_DOMAIN = ".services.ai.azure.com"
COGNITIVE_SERVICES_DOMAIN = ".cognitiveservices.azure.com"


def translator_endpoint_from_project(endpoint: str | None) -> str | None:
    if not endpoint:
        return None
    normalized = endpoint.strip().rstrip("/")
    if not normalized:
        return None
    if "://" not in normalized and "/" not in normalized:
        return f"https://{normalized}{COGNITIVE_SERVICES_DOMAIN}"
    parsed = urlparse(normalized)
    if parsed.scheme.lower() != "https" or not parsed.netloc:
        return None
    hostname = parsed.netloc.lower()
    if hostname.endswith(COGNITIVE_SERVICES_DOMAIN):
        return f"https://{parsed.netloc}"
    if hostname.endswith(AI_SERVICES_DOMAIN):
        resource_name = parsed.netloc[: -len(AI_SERVICES_DOMAIN)]
        if resource_name:
            return f"https://{resource_name}{COGNITIVE_SERVICES_DOMAIN}"
    return None

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
    flux_endpoint: str | None = None
    hosted_agent_name: str | None = None
    application_insights_resource_id: str | None = None
    realtime_transcription_model: str = ""
    realtime_transcription_models: list[str] = field(default_factory=list)
    live_interpreter_binding_configured: bool = False
    realtime_translation_model: str = "gpt-realtime-translate"
    translator_endpoint: str | None = None
    translator_key: str | None = None
    content_understanding_endpoint: str | None = None
    content_understanding_key: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "realtime_transcription_models",
            list(
                dict.fromkeys(
                    model
                    for model in [
                        self.realtime_transcription_model,
                        *self.realtime_transcription_models,
                    ]
                    if model.strip()
                )
            ),
        )

    @property
    def is_configured(self) -> bool:
        return bool(self.endpoint)

    @property
    def is_realtime_configured(self) -> bool:
        return bool(self.realtime_endpoint and self.realtime_model)

    @property
    def is_realtime_transcription_configured(self) -> bool:
        return bool(self.realtime_endpoint)

    @property
    def is_realtime_translation_configured(self) -> bool:
        return bool(self.realtime_endpoint and self.realtime_translation_model)

    @property
    def is_text_translation_configured(self) -> bool:
        return bool(self.translator_endpoint)

    @property
    def is_content_extractor_configured(self) -> bool:
        return bool(self.content_understanding_endpoint)

    @property
    def is_traditional_voice_configured(self) -> bool:
        return bool(self.endpoint and self.transcription_model and self.tts_model)

    @property
    def is_agent_research_configured(self) -> bool:
        return bool(self.endpoint)

    @property
    def is_hosted_agent_configured(self) -> bool:
        return bool(self.endpoint and self.hosted_agent_name)

    @property
    def is_speech_transcription_configured(self) -> bool:
        return bool(self.speech_endpoint)

    @property
    def is_voice_live_configured(self) -> bool:
        return bool(self.voice_live_endpoint and self.voice_live_model)

    @property
    def is_live_interpreter_configured(self) -> bool:
        return bool(self.live_interpreter_binding_configured or self.speech_endpoint)

    @property
    def auth_mode(self) -> str:
        return "entra_id"


def load_settings(
    models: list[str] | None = None,
    *,
    live_interpreter_configured: bool = False,
) -> FoundrySettings:
    seed_models = env_csv("FOUNDRY_MODELS")
    models = list(dict.fromkeys([*(models or []), *seed_models]))
    project_endpoint = first_env(
        "FOUNDRY_PROJECT_ENDPOINT",
        "AZURE_AI_PROJECT_ENDPOINT",
        "AZURE_AIPROJECT_ENDPOINT",
        "FOUNDRY_ENDPOINT",
        "FOUNDRY_OPENAI_ENDPOINT",
        "AZURE_OPENAI_ENDPOINT",
    )
    realtime_model = (
        first_env("FOUNDRY_REALTIME_MODEL")
        or next((model for model in models if "realtime" in model.lower()), None)
        or "gpt-realtime-2.1"
    )

    realtime_transcription_model = first_env("FOUNDRY_REALTIME_TRANSCRIPTION_MODEL") or ""
    realtime_transcription_models = env_csv("FOUNDRY_REALTIME_TRANSCRIPTION_MODELS")

    return FoundrySettings(
        endpoint=project_endpoint,
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
        embedding_model=first_env("FOUNDRY_EMBEDDING_MODEL", default="text-embedding-3-small")
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
            default="gpt-audio-mini",
        )
        or "gpt-audio-mini",
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
        flux_endpoint=first_env("FOUNDRY_FLUX_ENDPOINT"),
        hosted_agent_name=first_env("FOUNDRY_HOSTED_AGENT_NAME", default="hosted-assistant")
        or "hosted-assistant",
        application_insights_resource_id=first_env(
            "FOUNDRY_APPLICATION_INSIGHTS_RESOURCE_ID",
            "APPLICATIONINSIGHTS_RESOURCE_ID",
        ),
        realtime_transcription_model=realtime_transcription_model,
        realtime_transcription_models=realtime_transcription_models,
        realtime_translation_model=first_env(
            "FOUNDRY_REALTIME_TRANSLATION_MODEL",
            default="gpt-realtime-translate",
        )
        or "gpt-realtime-translate",
        live_interpreter_binding_configured=live_interpreter_configured,
        translator_endpoint=first_env(
            "FOUNDRY_TRANSLATOR_ENDPOINT",
            "AZURE_TRANSLATOR_ENDPOINT",
            "AZURE_AI_SERVICES_ENDPOINT",
        )
        or translator_endpoint_from_project(project_endpoint),
        translator_key=first_env(
            "FOUNDRY_TRANSLATOR_KEY",
            "AZURE_TRANSLATOR_KEY",
            "AZURE_AI_SERVICES_KEY",
            "COGNITIVE_SERVICES_KEY",
        ),
        content_understanding_endpoint=first_env(
            "FOUNDRY_CONTENT_UNDERSTANDING_ENDPOINT",
            "AZURE_CONTENT_UNDERSTANDING_ENDPOINT",
            "AZURE_AI_SERVICES_ENDPOINT",
        )
        or translator_endpoint_from_project(project_endpoint),
        content_understanding_key=first_env(
            "FOUNDRY_CONTENT_UNDERSTANDING_KEY",
            "AZURE_CONTENT_UNDERSTANDING_KEY",
            "AZURE_AI_SERVICES_KEY",
            "COGNITIVE_SERVICES_KEY",
        ),
    )
