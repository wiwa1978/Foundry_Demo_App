# Document Q&A implementation

This folder is the customer-facing entry point for the Document Q&A use case.

## Frontend

- [`api.ts`](./api.ts): document list/upload/delete and grounded SSE request contracts.
- [`types.ts`](./types.ts): document and embedding trace contracts.
- [`App.tsx`](../../App.tsx): shared chat/document workspace rendering and event state.

## Backend

- [FastAPI router](../../../../app/features/document_qa/router.py)
- [Document Q&A service](../../../../app/services/document_qa.py)
- [Blob/Search gateway](../../../../app/gateways/documents.py)
- [Azure implementation](../../../../app/document_store.py)
- [Shared chat service](../../../../app/services/chat.py)

The upload path validates files, stores originals in Blob Storage, creates embeddings, and writes
tenant-scoped chunks to Azure AI Search. The question path retrieves owner-scoped chunks, builds a
grounded prompt, streams the selected model, and persists the conversation.

## Tests

- [Backend feature tests](../../../../tests/test_document_qa_api.py)
- [Frontend API tests](./api.test.ts)
