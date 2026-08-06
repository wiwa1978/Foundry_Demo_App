import { readServerSentEvents } from "@/features/textChat/sse";
import type { ChatStreamEvent, TextChatRequest } from "@/features/textChat/types";
import type { FetchClient } from "@/features/textChat/api";

import type { DocumentSummary, DocumentUploadResponse } from "./types";

async function publicError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => ({}))) as { detail?: string };
  return body.detail ?? fallback;
}

export async function listDocuments(fetchClient: FetchClient) {
  const response = await fetchClient("/api/documents", {}, { label: "List RAG documents", responseKind: "json" });
  if (!response.ok) throw new Error(await publicError(response, "Failed to load documents."));
  return (await response.json()) as { documents: DocumentSummary[] };
}

export async function uploadDocuments(fetchClient: FetchClient, files: FileList) {
  const form = new FormData();
  const summaries = Array.from(files).map((file) => ({ name: file.name, type: file.type, bytes: file.size }));
  Array.from(files).forEach((file) => form.append("files", file));
  const response = await fetchClient(
    "/api/documents",
    { method: "POST", body: form },
    { label: "Upload RAG documents", request: { files: summaries }, responseKind: "json" },
  );
  if (!response.ok) throw new Error(await publicError(response, "Failed to upload documents."));
  return { response, body: (await response.json()) as DocumentUploadResponse };
}

export async function removeDocument(fetchClient: FetchClient, documentId: string) {
  const response = await fetchClient(
    `/api/documents/${documentId}`,
    { method: "DELETE" },
    { label: "Delete RAG document", responseKind: "json" },
  );
  if (!response.ok) throw new Error(await publicError(response, "Failed to delete document."));
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
    "/api/documents/ask/stream",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    },
    { label: "Stream document RAG answer", request, responseKind: "stream" },
  );
  if (!response.ok) throw new Error(await publicError(response, "Document question failed."));
  return { response, events: await readServerSentEvents<ChatStreamEvent>(response, onEvent) };
}
