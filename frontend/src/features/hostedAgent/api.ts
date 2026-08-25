import { readPublicApiError } from "@/api/errors";
import type { FetchClient } from "@/api/types";
import { readServerSentEvents } from "@/features/textChat/sse";

import type { HostedAgentStreamEvent } from "./types";

export const hostedAgentStreamEndpoint = "/api/hosted-agent/stream";

export async function streamHostedAgent({
  fetchClient,
  message,
  agentKey,
  signal,
  onEvent,
}: {
  fetchClient: FetchClient;
  message: string;
  agentKey?: string | null;
  signal?: AbortSignal;
  onEvent: (event: HostedAgentStreamEvent) => void;
}) {
  const body: Record<string, unknown> = { message };
  if (agentKey) body.agent_key = agentKey;
  const response = await fetchClient(
    hostedAgentStreamEndpoint,
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    {
      label: "Run code-hosted agent",
      request: body,
      responseKind: "stream",
    },
  );
  if (!response.ok) {
    throw new Error(await readPublicApiError(response, "Hosted agent failed."));
  }
  return readServerSentEvents<HostedAgentStreamEvent>(response, onEvent);
}
