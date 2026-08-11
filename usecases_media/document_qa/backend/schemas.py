from pydantic import BaseModel

from app.api.features.shared_schemas import ProviderTrace


class DocumentResponse(BaseModel):
    id: str
    filename: str
    content_type: str | None
    byte_size: int
    chunk_count: int
    blob_name: str | None
    blob_url: str | None
    created_at: str


class DocumentListResponse(BaseModel):
    documents: list[DocumentResponse]


class EmbeddingTraceResponse(BaseModel):
    model: str
    duration_ms: int
    dimensions: int
    foundry_request: ProviderTrace
    foundry_response: ProviderTrace


class DocumentUploadResponse(BaseModel):
    documents: list[DocumentResponse]
    embedding_traces: list[EmbeddingTraceResponse]
