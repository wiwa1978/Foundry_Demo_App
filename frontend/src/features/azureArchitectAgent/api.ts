import { readPublicApiError } from "@/api/errors";
import type { FetchClient } from "@/api/types";
import { readServerSentEvents } from "@/features/textChat/sse";

import type { AzureArchitectAgentStreamEvent, AzureArchitectAgentTrace } from "./types";

export const azureArchitectAgentStreamEndpoint = "/api/azure-architect-agent/stream";
export const azureArchitectAgentTraceEndpoint = "/api/azure-architect-agent/trace";

export async function getAzureArchitectAgentTrace({
  fetchClient,
  responseId,
  signal,
}: {
  fetchClient: FetchClient;
  responseId: string;
  signal?: AbortSignal;
}) {
  const response = await fetchClient(
    `${azureArchitectAgentTraceEndpoint}?response_id=${encodeURIComponent(responseId)}`,
    { signal },
    {
      label: "Retrieve Azure Architect Agent trace",
      request: { response_id: responseId },
    },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(response, "Foundry trace retrieval failed."),
    );
  }
  return (await response.json()) as AzureArchitectAgentTrace;
}

export async function streamAzureArchitectAgent({
  fetchClient,
  question,
  signal,
  onEvent,
}: {
  fetchClient: FetchClient;
  question: string;
  signal?: AbortSignal;
  onEvent: (event: AzureArchitectAgentStreamEvent) => void;
}) {
  const response = await fetchClient(
    azureArchitectAgentStreamEndpoint,
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    },
    {
      label: "Run Azure Architect Agent",
      request: { question },
      responseKind: "stream",
    },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(response, "Azure Architect Agent failed."),
    );
  }
  return {
    response,
    events: await readServerSentEvents<AzureArchitectAgentStreamEvent>(
      response,
      onEvent,
    ),
  };
}
