from typing import Any

from pydantic import BaseModel


class ContentExtractorResponse(BaseModel):
    mode: str
    filename: str
    mime_type: str
    analyzer_id: str
    operation_id: str | None = None
    status: str
    extracted_text: str
    fields: dict[str, Any]
    warnings: list[dict[str, Any]]
