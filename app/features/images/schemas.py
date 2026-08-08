from pydantic import BaseModel


class ImageResponse(BaseModel):
    model: str
    image_base64: str
    mime_type: str
    width: int
    height: int
    duration_ms: int


class ImageSampleResponse(BaseModel):
    id: str
    name: str
    attribution: str
    source_url: str
    image_url: str
