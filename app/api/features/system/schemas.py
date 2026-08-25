from typing import Literal

from pydantic import BaseModel


class HostedAgentVariantResponse(BaseModel):
    key: str
    label: str
    agent_name: str


class ConfigResponse(BaseModel):
    entra_auth_enabled: bool
    is_configured: bool
    endpoint: str | None
    auth_mode: str
    models: list[str]
    is_azure_architect_agent_configured: bool
    is_hosted_agent_configured: bool
    hosted_agent_name: str | None
    hosted_agent_variants: list[HostedAgentVariantResponse]
    is_retail_agent_configured: bool
    retail_agent_name: str | None
    is_investment_planner_configured: bool
    investment_planner_agent_name: str | None
    is_realtime_configured: bool
    realtime_endpoint: str | None
    realtime_model: str | None
    is_realtime_transcription_configured: bool
    realtime_transcription_model: str | None
    realtime_transcription_models: list[str]
    is_realtime_translation_configured: bool
    realtime_translation_model: str | None
    embedding_model: str
    is_document_rag_configured: bool
    search_endpoint: str | None
    search_index_name: str
    storage_account_url: str | None
    storage_container_name: str
    is_traditional_voice_configured: bool
    transcription_model: str | None
    tts_model: str | None
    tts_voice: str | None
    is_speech_transcription_configured: bool
    speech_transcription_model: str | None
    is_voice_live_configured: bool
    voice_live_model: str | None
    voice_live_voice: str | None
    is_live_interpreter_configured: bool
    is_text_translation_configured: bool
    is_content_extractor_configured: bool


class HealthResponse(BaseModel):
    status: Literal["ok"]


class ReadinessResponse(BaseModel):
    status: Literal["ready", "not_ready"]
