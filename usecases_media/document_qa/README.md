# Document Q&A

Retrieval-augmented chat over uploaded documents using Blob Storage, Azure AI Search, and Foundry embeddings.

| Layer | Location |
| --- | --- |
| Marketplace module | [`module.ts`](module.ts) |
| Frontend entry point | [`frontend.ts`](frontend.ts) |
| Backend entry point | [`backend.py`](backend.py) |
| Frontend | [`frontend/src/features/documentQa`](../../frontend/src/features/documentQa) |
| Backend API | [`app/features/document_qa`](../../app/features/document_qa) |
| Document service | [`app/services/document_qa.py`](../../app/services/document_qa.py) |
| Document gateway | [`app/gateways/documents.py`](../../app/gateways/documents.py) |
| Backend tests | [`tests/test_document_qa_api.py`](../../tests/test_document_qa_api.py) |
