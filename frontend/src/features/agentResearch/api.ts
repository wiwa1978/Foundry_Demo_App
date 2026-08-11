import { readPublicApiError } from "@/api/errors";
import type { FetchClient } from "@/api/types";
import { readServerSentEvents } from "@/features/textChat/sse";

import type { AgentResearchStreamEvent, AgentResearchTrace } from "./types";

export const agentResearchStreamEndpoint = "/api/agent-research/stream";
export const agentResearchTraceEndpoint = "/api/agent-research/trace";

export async function getAgentResearchTrace({
  fetchClient,
  responseId,
  signal,
}: {
  fetchClient: FetchClient;
  responseId: string;
  signal?: AbortSignal;
}) {
  const response = await fetchClient(
    `${agentResearchTraceEndpoint}?response_id=${encodeURIComponent(responseId)}`,
    { signal },
    {
      label: "Retrieve research agent trace",
      request: { response_id: responseId },
    },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(response, "Foundry trace retrieval failed."),
    );
  }
  return (await response.json()) as AgentResearchTrace;
}

export async function streamAgentResearch({
  fetchClient,
  question,
  signal,
  onEvent,
}: {
  fetchClient: FetchClient;
  question: string;
  signal?: AbortSignal;
  onEvent: (event: AgentResearchStreamEvent) => void;
}) {
  const response = await fetchClient(
    agentResearchStreamEndpoint,
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    },
    {
      label: "Run research agent",
      request: { question },
      responseKind: "stream",
    },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(response, "Research agent failed."),
    );
  }
  return {
    response,
    events: await readServerSentEvents<AgentResearchStreamEvent>(
      response,
      onEvent,
    ),
  };
}
