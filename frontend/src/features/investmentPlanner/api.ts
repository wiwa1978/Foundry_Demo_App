import { readPublicApiError } from "@/api/errors";
import type { FetchClient } from "@/api/types";
import { readServerSentEvents } from "@/features/textChat/sse";

import type { InvestmentPlannerStreamEvent } from "./types";

export const investmentPlannerStreamEndpoint = "/api/investment-planner/stream";

export async function streamInvestmentPlanner({
  fetchClient,
  question,
  signal,
  onEvent,
}: {
  fetchClient: FetchClient;
  question: string;
  signal?: AbortSignal;
  onEvent: (event: InvestmentPlannerStreamEvent) => void;
}) {
  const response = await fetchClient(
    investmentPlannerStreamEndpoint,
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    },
    {
      label: "Run investment planner agent",
      request: { question },
      responseKind: "stream",
    },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(response, "Investment planner agent failed."),
    );
  }
  return readServerSentEvents<InvestmentPlannerStreamEvent>(response, onEvent);
}
