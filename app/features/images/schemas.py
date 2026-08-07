from pydantic import BaseModel


class ImageResponse(BaseModel):
    model: str
    image_base64: str
    mime_type: str
    width: int
    height: int
    duration_ms: int
