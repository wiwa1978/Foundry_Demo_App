import { readServerSentEvents } from "./sse";
import type { ChatStreamEvent, TextChatRequest } from "./types";

export type FetchClient = (
  url: string,
  init?: RequestInit,
  options?: {
    label?: string;
    request?: unknown;
    responseKind?: "json" | "text" | "stream";
  },
) => Promise<Response>;

export async function streamTextChat({
  request,
  fetchClient,
  signal,
  onEvent,
}: {
  request: TextChatRequest;
  fetchClient: FetchClient;
  signal: AbortSignal;
  onEvent: (event: ChatStreamEvent) => void;
}) {
  const response = await fetchClient(
    "/api/chat/stream",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    },
    { label: "Stream chat", request, responseKind: "stream" },
  );
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(error.detail ?? "Chat request failed.");
  }
  return {
    response,
    events: await readServerSentEvents<ChatStreamEvent>(response, onEvent),
  };
}
