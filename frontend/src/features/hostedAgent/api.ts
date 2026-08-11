import { readPublicApiError } from "@/api/errors";
import type { FetchClient } from "@/api/types";
import { readServerSentEvents } from "@/features/textChat/sse";

import type { HostedAgentStreamEvent } from "./types";

export const hostedAgentStreamEndpoint = "/api/hosted-agent/stream";

export async function streamHostedAgent({
  fetchClient,
  message,
  signal,
  onEvent,
}: {
  fetchClient: FetchClient;
  message: string;
  signal?: AbortSignal;
  onEvent: (event: HostedAgentStreamEvent) => void;
}) {
  const response = await fetchClient(
    hostedAgentStreamEndpoint,
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    },
    {
      label: "Run code-hosted agent",
      request: { message },
      responseKind: "stream",
    },
  );
  if (!response.ok) {
    throw new Error(await readPublicApiError(response, "Hosted agent failed."));
  }
  return readServerSentEvents<HostedAgentStreamEvent>(response, onEvent);
}
