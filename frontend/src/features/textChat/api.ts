import { readPublicApiError } from "@/api/errors";
import type { FetchClient } from "@/api/types";

import { readServerSentEvents } from "./sse";
import type { ChatStreamEvent, TextChatRequest } from "./types";

export const textChatStreamEndpoint = "/api/chat/stream";

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
    textChatStreamEndpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    },
    { label: "Stream chat", request, responseKind: "stream" },
  );
  if (!response.ok) {
    throw new Error(await readPublicApiError(response, "Chat request failed."));
  }
  return {
    response,
    events: await readServerSentEvents<ChatStreamEvent>(response, onEvent),
  };
}
