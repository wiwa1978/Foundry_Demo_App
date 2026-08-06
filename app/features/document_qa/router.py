import asyncio
import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse

from app.errors import ExternalServiceError
from app.features.dependencies import current_user_scope
from app.observability import audit_event
from app.schemas import DocumentQuestionRequest
from app.security import UserScope
from app.services.document_qa import document_qa_service


router = APIRouter(tags=["Document Q&A"])
logger = logging.getLogger(__name__)
MAX_DOCUMENT_FILES = 10
MAX_DOCUMENT_UPLOAD_BYTES = 50 * 1024 * 1024


@router.get("/api/documents")
def get_documents(scope: Annotated[UserScope, Depends(current_user_scope)]) -> dict:
    try:
        return {"documents": document_qa_service.list_documents(scope)}
    except Exception as exc:
        logger.exception("document_listing_failed")
        raise ExternalServiceError("Document listing") from exc


@router.post("/api/documents")
async def post_documents(
    scope: Annotated[UserScope, Depends(current_user_scope)],
    request: Request,
    files: list[UploadFile] = File(...),
) -> dict:
    if not files:
        raise HTTPException(status_code=422, detail="Upload at least one document.")
    if len(files) > MAX_DOCUMENT_FILES:
        raise HTTPException(status_code=413, detail="Upload at most 10 documents at a time.")
    documents, traces = [], []
    try:
        for file in files:
            data = await file.read(MAX_DOCUMENT_UPLOAD_BYTES + 1)
            if len(data) > MAX_DOCUMENT_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="Document upload cannot exceed 50 MB.")
            result = await asyncio.to_thread(
                document_qa_service.add_document,
                scope,
                file.filename or "uploaded-document",
                file.content_type,
                data,
            )
            documents.append(result["document"])
            traces.append(result["embedding"])
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("document_upload_failed")
        raise ExternalServiceError("Document upload") from exc
    audit_event("documents_uploaded", request=request, count=len(documents))
    return {"documents": documents, "embedding_traces": traces}


@router.delete("/api/documents/{document_id}")
def delete_document(
    document_id: str,
    scope: Annotated[UserScope, Depends(current_user_scope)],
    request: Request,
) -> dict:
    try:
        if not document_qa_service.delete_document(scope, document_id):
            raise HTTPException(status_code=404, detail="Document not found.")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("document_deletion_failed")
        raise ExternalServiceError("Document deletion") from exc
    audit_event("document_deleted", request=request, document_id=document_id)
    return {"deleted": True}


@router.post("/api/documents/ask/stream")
def ask_document(
    request: DocumentQuestionRequest,
    scope: Annotated[UserScope, Depends(current_user_scope)],
) -> StreamingResponse:
    try:
        prepared = document_qa_service.prepare(request, scope)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("document_question_failed")
        raise ExternalServiceError("Document question") from exc
    return StreamingResponse(
        (
            f"data: {json.dumps(event)}\n\n"
            for event in document_qa_service.stream(request, scope, prepared)
        ),
        media_type="text/event-stream",
    )
