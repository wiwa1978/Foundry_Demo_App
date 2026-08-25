from app.api.schemas import InternalRequestModel


class VideoTranslationResponse(InternalRequestModel):
    transcript: str
    translated_text: str
    source_language: str | None = None
    target_language: str
    voice: str
    video_base64: str
    video_mime_type: str = "video/mp4"
    transcription_model: str
