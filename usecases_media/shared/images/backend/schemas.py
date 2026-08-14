from pydantic import BaseModel

from app.api.features.conversations.schemas import ConversationResponse, MessageResponse


class ImageResponse(BaseModel):
    model: str
    image_base64: str
    mime_type: str
    width: int
    height: int
    duration_ms: int
    conversation: ConversationResponse | None = None
    user_message: MessageResponse | None = None
    assistant_message: MessageResponse | None = None


class ImageSampleResponse(BaseModel):
    id: str
    name: str
    attribution: str
    source_url: str
    image_url: str
