import { readPublicApiError } from "@/api/errors";
import type { FetchClient } from "@/api/types";
import { readServerSentEvents } from "@/features/textChat/sse";
import type {
  ChatStreamEvent,
  TextChatRequest,
} from "@/features/textChat/types";

import type { DocumentSummary, DocumentUploadResponse } from "./types";

export const documentsEndpoint = "/api/documents";
export const documentAnswerStreamEndpoint = "/api/documents/ask/stream";

export async function listDocuments(
  fetchClient: FetchClient,
  signal?: AbortSignal,
) {
  const response = await fetchClient(
    documentsEndpoint,
    { signal },
    { label: "List RAG documents", responseKind: "json" },
  );
  if (!response.ok)
    throw new Error(
      await readPublicApiError(response, "Failed to load documents."),
    );
  return (await response.json()) as { documents: DocumentSummary[] };
}

export async function uploadDocuments(
  fetchClient: FetchClient,
  files: FileList,
  signal?: AbortSignal,
) {
  const form = new FormData();
  const summaries = Array.from(files).map((file) => ({
    name: file.name,
    type: file.type,
    bytes: file.size,
  }));
  Array.from(files).forEach((file) => form.append("files", file));
  const response = await fetchClient(
    documentsEndpoint,
    { method: "POST", body: form, signal },
    {
      label: "Upload RAG documents",
      request: { files: summaries },
      responseKind: "json",
    },
  );
  if (!response.ok)
    throw new Error(
      await readPublicApiError(response, "Failed to upload documents."),
    );
  return { response, body: (await response.json()) as DocumentUploadResponse };
}

export async function removeDocument(
  fetchClient: FetchClient,
  documentId: string,
  signal?: AbortSignal,
) {
  const response = await fetchClient(
    `${documentsEndpoint}/${documentId}`,
    { method: "DELETE", signal },
    { label: "Delete RAG document", responseKind: "json" },
  );
  if (!response.ok)
    throw new Error(
      await readPublicApiError(response, "Failed to delete document."),
    );
}

export async function streamDocumentAnswer({
  fetchClient,
  request,
  signal,
  onEvent,
}: {
  fetchClient: FetchClient;
  request: TextChatRequest;
  signal: AbortSignal;
  onEvent: (event: ChatStreamEvent) => void;
}) {
  const response = await fetchClient(
    documentAnswerStreamEndpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    },
    { label: "Stream document RAG answer", request, responseKind: "stream" },
  );
  if (!response.ok)
    throw new Error(
      await readPublicApiError(response, "Document question failed."),
    );
  return {
    response,
    events: await readServerSentEvents<ChatStreamEvent>(response, onEvent),
  };
}
