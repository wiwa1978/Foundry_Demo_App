import { readPublicApiError } from "@/api/errors";
import type { FetchClient } from "@/api/types";

import type { EvaluationListResponse, EvaluationRun } from "./types";

const evaluationsEndpoint = "/api/evaluations";
const adminEvaluationsEndpoint = "/api/admin/evaluations";

export async function loadEvaluations(
  fetchClient: FetchClient,
  useCase: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ use_case: useCase, limit: "10" });
  const response = await fetchClient(
    `${evaluationsEndpoint}?${params.toString()}`,
    { signal },
    { label: "Load Foundry evaluations", responseKind: "json" },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(response, "Failed to load Foundry evaluations."),
    );
  }
  return (await response.json()) as EvaluationListResponse;
}

export async function loadAdminEvaluations(
  fetchClient: FetchClient,
  useCase: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ use_case: useCase, limit: "20" });
  const response = await fetchClient(
    `${adminEvaluationsEndpoint}?${params.toString()}`,
    { signal },
    { label: "Load evaluation administration", responseKind: "json" },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(
        response,
        "Failed to load evaluation administration.",
      ),
    );
  }
  return (await response.json()) as EvaluationListResponse;
}

export async function rerunEvaluation(
  fetchClient: FetchClient,
  evaluationId: string,
  sourceRunId: string,
  name: string,
) {
  const request = { source_run_id: sourceRunId, name };
  const response = await fetchClient(
    `${adminEvaluationsEndpoint}/${encodeURIComponent(evaluationId)}/runs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    {
      label: "Rerun Foundry evaluation",
      request,
      responseKind: "json",
    },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(response, "Failed to rerun the evaluation."),
    );
  }
  return (await response.json()) as EvaluationRun;
}

export async function cancelEvaluationRun(
  fetchClient: FetchClient,
  evaluationId: string,
  runId: string,
) {
  const response = await fetchClient(
    `${adminEvaluationsEndpoint}/${encodeURIComponent(evaluationId)}/runs/${encodeURIComponent(runId)}/cancel`,
    { method: "POST" },
    { label: "Cancel Foundry evaluation run", responseKind: "json" },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(
        response,
        "Failed to cancel the evaluation run.",
      ),
    );
  }
  return (await response.json()) as EvaluationRun;
}
