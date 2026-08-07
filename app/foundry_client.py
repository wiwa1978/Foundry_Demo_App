"""Compatibility imports for the capability-specific Foundry providers."""

from app.providers.chat import (
    build_foundry_request_trace,
    complete_chat,
    create_embeddings,
    stream_chat,
)
from app.providers.clients import (
    azure_openai_endpoint as _azure_openai_endpoint,
)
from app.providers.http import build_checked_request, open_checked_url
from app.providers.images import _extract_generated_image, edit_image, generate_image
from app.providers.realtime import (
    create_realtime_client_secret,
    create_voice_live_connection_info,
)
from app.providers.settings import FoundrySettings, load_settings
from app.providers.speech import synthesize_speech, transcribe_audio, transcribe_speech_audio
from app.providers.tracing import (
    build_foundry_response_trace,
    build_foundry_stream_response_trace,
    redact_foundry_trace,
)

__all__ = [
    "FoundrySettings",
    "_azure_openai_endpoint",
    "_extract_generated_image",
    "build_checked_request",
    "build_foundry_request_trace",
    "build_foundry_response_trace",
    "build_foundry_stream_response_trace",
    "complete_chat",
    "create_embeddings",
    "create_realtime_client_secret",
    "create_voice_live_connection_info",
    "edit_image",
    "generate_image",
    "load_settings",
    "open_checked_url",
    "redact_foundry_trace",
    "stream_chat",
    "synthesize_speech",
    "transcribe_audio",
    "transcribe_speech_audio",
]
