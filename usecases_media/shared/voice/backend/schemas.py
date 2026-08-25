from typing import Literal

from pydantic import BaseModel

from app.api.features.conversations.schemas import (
    ConversationResponse,
    MessageResponse,
    UsageResponse,
)
from app.api.features.shared_schemas import ProviderMetadata, ProviderTrace
from app.domain.models import GuardrailVariant
from usecases_media.text_chat.backend.schemas import ModelResultResponse, ProviderResultResponse


class RealtimeSessionResponse(BaseModel):
    token: str
    webrtc_url: str
    model: str
    voice: str
    expires_at: int | float | str | None = None
    guardrail_comparison_available: bool
    configured_guardrail_policy_name: str | None
    guardrail_status: str


class RealtimeTranscriptionSessionResponse(BaseModel):
    token: str
    webrtc_url: str
    model: str
    expires_at: int | float | str | None = None


class TranscriptionResponse(BaseModel):
    model: str
    text: str
    language: str
    duration_ms: int
    segments: list[str] | None = None
    foundry_request: ProviderTrace | None = None
    foundry_response: ProviderTrace | None = None


class SpeechResponse(BaseModel):
    model: str
    voice: str
    audio_base64: str
    audio_mime_type: str
    duration_ms: int
    spoken_transcript: str | None = None
    foundry_request: ProviderTrace | None = None
    foundry_response: ProviderTrace | None = None


class TextToSpeechRequest(BaseModel):
    text: str
    model: str = "azure-speech"
    voice: str = "en-US-Ava:DragonHDLatestNeural"
    language: str = "en-US"
    emotion: str = "neutral"
    pitch: str = "0%"
    rate: str = "0%"
    volume: str = "0%"


class TextToSpeechResponse(BaseModel):
    model: str
    voice: str
    language: str
    emotion: str
    audio_base64: str
    audio_mime_type: str
    duration_ms: int
    speech_request: dict[str, str | int]


class TextToSpeechAvatarRequest(BaseModel):
    text: str
    avatar_type: Literal["video", "photo"] = "video"
    character: str = "lisa"
    style: str = "graceful-sitting"
    voice: str = "en-US-Ava:DragonHDLatestNeural"
    language: str = "en-US"
    custom_voice_endpoint_id: str = ""
    customized: bool = False
    use_built_in_voice: bool = False
    background_color: str = "#FFFFFFFF"
    background_image: str = ""


class TextToSpeechAvatarJobResponse(BaseModel):
    id: str
    status: str
    output_url: str | None = None
    summary_url: str | None = None
    error: str | None = None


class TraditionalVoiceVariantResponse(ModelResultResponse):
    speech: SpeechResponse | None = None
    speech_error: str | None = None


class TraditionalVoiceChatResponse(ProviderResultResponse):
    speech_error: str | None = None


class TraditionalTranscriptionResponse(BaseModel):
    model: str
    text: str
    duration_ms: int
    foundry_request: ProviderTrace | None = None
    foundry_response: ProviderTrace | None = None


class TraditionalVoiceResponse(BaseModel):
    model: str
    transcription: TraditionalTranscriptionResponse
    results: list[TraditionalVoiceVariantResponse]
    conversation: ConversationResponse
    user_message: MessageResponse
    api_surface: str | None = None
    content: str | None = None
    duration_ms: int | None = None
    usage: UsageResponse | None = None
    error: str | None = None
    guardrail_variant: GuardrailVariant | None = None
    guardrail_policy_name: str | None = None
    guardrail_results: ProviderMetadata | None = None
    assistant_message: MessageResponse | None = None
    foundry_request: ProviderTrace | None = None
    foundry_response: ProviderTrace | None = None
    pronunciation_assessment: dict[str, str | float | None] | None = None
    pronunciation_assessment_error: str | None = None
    chat: TraditionalVoiceChatResponse | None = None
    speech: SpeechResponse | None = None
    speech_error: str | None = None
