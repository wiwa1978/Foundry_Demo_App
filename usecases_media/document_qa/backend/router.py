import asyncio
import json
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse

from app.api.dependencies import current_user_scope
from app.api.features.shared_schemas import DeletedResponse
from app.api.schemas import DocumentQuestionRequest
from app.core.errors import NotFoundError
from app.core.observability import audit_event
from app.domain.identity import UserScope
from usecases_media.document_qa.backend.limits import (
    MAX_DOCUMENT_AGGREGATE_BYTES,
    MAX_DOCUMENT_BYTES,
    MAX_DOCUMENT_FILES,
)
from usecases_media.document_qa.backend.schemas import DocumentListResponse, DocumentUploadResponse
from usecases_media.document_qa.backend.service import document_qa_service

router = APIRouter(tags=["Document Q&A"])


@router.get("/api/documents", response_model=DocumentListResponse)
def get_documents(scope: Annotated[UserScope, Depends(current_user_scope)]) -> dict:
    return {"documents": document_qa_service.list_documents(scope)}


@router.post("/api/documents", response_model=DocumentUploadResponse)
async def post_documents(
    scope: Annotated[UserScope, Depends(current_user_scope)],
    request: Request,
    files: list[UploadFile] = File(...),
) -> dict:
    if not files:
        raise HTTPException(status_code=422, detail="Upload at least one document.")
    if len(files) > MAX_DOCUMENT_FILES:
        raise HTTPException(status_code=413, detail="Upload at most 10 documents at a time.")
    uploads: list[tuple[UploadFile, bytes]] = []
    total_bytes = 0
    for file in files:
        remaining_bytes = MAX_DOCUMENT_AGGREGATE_BYTES - total_bytes
        data = await file.read(min(MAX_DOCUMENT_BYTES, remaining_bytes) + 1)
        if len(data) > MAX_DOCUMENT_BYTES:
            raise HTTPException(status_code=413, detail="Each document cannot exceed 12 MB.")
        if len(data) > remaining_bytes:
            raise HTTPException(
                status_code=413,
                detail="Document uploads cannot exceed 50 MB in total.",
            )
        total_bytes += len(data)
        uploads.append((file, data))

    documents, traces = [], []
    for file, data in uploads:
        result = await asyncio.to_thread(
            document_qa_service.add_document,
            scope,
            file.filename or "uploaded-document",
            file.content_type,
            data,
        )
        documents.append(result["document"])
        traces.append(result["embedding"])
    audit_event("documents_uploaded", request=request, count=len(documents))
    return {"documents": documents, "embedding_traces": traces}


@router.delete("/api/documents/{document_id}", response_model=DeletedResponse)
def delete_document(
    document_id: str,
    scope: Annotated[UserScope, Depends(current_user_scope)],
    request: Request,
) -> dict:
    if not document_qa_service.delete_document(scope, document_id):
        raise NotFoundError("Document not found.")
    audit_event("document_deleted", request=request, document_id=document_id)
    return {"deleted": True}


@router.post("/api/documents/ask/stream")
def ask_document(
    request: DocumentQuestionRequest,
    scope: Annotated[UserScope, Depends(current_user_scope)],
) -> StreamingResponse:
    prepared = document_qa_service.prepare(request, scope)
    return StreamingResponse(
        (
            f"data: {json.dumps(event)}\n\n"
            for event in document_qa_service.stream(request, scope, prepared)
        ),
        media_type="text/event-stream",
    )
