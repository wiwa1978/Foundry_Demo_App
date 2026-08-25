import { readPublicApiError } from "@/api/errors";
import type { FetchClient } from "@/api/types";
import { readServerSentEvents } from "@/features/textChat/sse";

import type { GuardrailBatchEvent, GuardrailBatchRequest } from "./batchTypes";

export const guardrailBatchStreamEndpoint = "/api/guardrails/batch/stream";

export async function streamGuardrailBatch({
  request,
  fetchClient,
  signal,
  onEvent,
}: {
  request: GuardrailBatchRequest;
  fetchClient: FetchClient;
  signal: AbortSignal;
  onEvent: (event: GuardrailBatchEvent) => void;
}) {
  const response = await fetchClient(
    guardrailBatchStreamEndpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    },
    { label: "Stream guardrail batch", request, responseKind: "stream" },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(response, "Guardrail batch evaluation failed."),
    );
  }
  return {
    response,
    events: await readServerSentEvents<GuardrailBatchEvent>(response, onEvent),
  };
}
