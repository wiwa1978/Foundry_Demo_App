import { readPublicApiError } from "@/api/errors";
import type { FetchClient } from "@/api/types";
import { readServerSentEvents } from "@/features/textChat/sse";

import type { RetailAgentStreamEvent, RetailCartItem } from "./types";

export const retailAgentStreamEndpoint = "/api/retail-agent/stream";

export async function streamRetailAgent({
  fetchClient,
  message,
  sessionId,
  cart,
  signal,
  onEvent,
}: {
  fetchClient: FetchClient;
  message: string;
  sessionId?: string | null;
  cart: RetailCartItem[];
  signal?: AbortSignal;
  onEvent: (event: RetailAgentStreamEvent) => void;
}) {
  const body = { message, session_id: sessionId, cart };
  const response = await fetchClient(
    retailAgentStreamEndpoint,
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { label: "Run Retail Shopping Assistant", request: body, responseKind: "stream" },
  );
  if (!response.ok) {
    throw new Error(await readPublicApiError(response, "Retail assistant failed."));
  }
  return readServerSentEvents<RetailAgentStreamEvent>(response, onEvent);
}
