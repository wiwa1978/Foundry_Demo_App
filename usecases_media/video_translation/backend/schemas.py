from app.api.schemas import InternalRequestModel


class CaptionCue(InternalRequestModel):
    index: int
    start_ms: int
    end_ms: int
    text: str


class CaptioningResponse(InternalRequestModel):
    transcript: str
    language: str
    transcription_model: str
    captions: list[CaptionCue]
    webvtt: str
    srt: str


class DubbingResponse(InternalRequestModel):
    transcript: str
    translated_text: str
    source_language: str | None = None
    target_language: str
    voice: str
    audio_base64: str
    audio_mime_type: str
    transcription_model: str


class VideoTranslationResponse(InternalRequestModel):
    transcript: str
    translated_text: str
    source_language: str | None = None
    target_language: str
    voice: str
    video_base64: str
    video_mime_type: str = "video/mp4"
    transcription_model: str
