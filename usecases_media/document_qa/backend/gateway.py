from typing import Any, Protocol

from app.domain.identity import UserScope
from usecases_media.document_qa.backend.store import (
    RetrievedChunk,
    UploadedDocument,
    add_document,
    build_grounded_prompt,
    build_rag_system_prompt,
    delete_document,
    list_documents,
    retrieve_document_chunks,
)


class DocumentGateway(Protocol):
    def list_documents(self, scope: UserScope) -> list[UploadedDocument]: ...
    def add(
        self, scope: UserScope, filename: str, content_type: str | None, data: bytes
    ) -> dict[str, Any]: ...
    def delete(self, scope: UserScope, document_id: str) -> bool: ...
    def retrieve(self, scope: UserScope, query: str) -> dict[str, Any]: ...
    def grounded_prompt(self, question: str, chunks: list[RetrievedChunk]) -> str: ...
    def system_prompt(self, prompt: str) -> str: ...


class AzureDocumentGateway:
    def list_documents(self, scope: UserScope) -> list[UploadedDocument]:
        return list_documents(scope)

    def add(
        self, scope: UserScope, filename: str, content_type: str | None, data: bytes
    ) -> dict[str, Any]:
        return add_document(scope=scope, filename=filename, content_type=content_type, data=data)

    def delete(self, scope: UserScope, document_id: str) -> bool:
        return delete_document(scope, document_id)

    def retrieve(self, scope: UserScope, query: str) -> dict[str, Any]:
        return retrieve_document_chunks(scope, query)

    def grounded_prompt(self, question: str, chunks: list[RetrievedChunk]) -> str:
        return build_grounded_prompt(question, chunks)

    def system_prompt(self, prompt: str) -> str:
        return build_rag_system_prompt(prompt)
