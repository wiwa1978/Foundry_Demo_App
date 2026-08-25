from pydantic import BaseModel


class ContentExtractorSampleResponse(BaseModel):
    id: str
    name: str
    description: str
    sample_url: str
