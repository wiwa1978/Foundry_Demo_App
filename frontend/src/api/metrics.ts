import { readPublicApiError } from "@/api/errors";
import type { FetchClient, ModelMetrics } from "@/api/types";

const modelMetricsEndpoint = "/api/metrics/model";

export async function loadModelMetrics(
  fetchClient: FetchClient,
  days: number,
  model: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ days: String(days) });
  if (model) {
    params.set("model", model);
  }
  const response = await fetchClient(
    `${modelMetricsEndpoint}?${params.toString()}`,
    { signal },
    { label: "Load model metrics", responseKind: "json" },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(response, "Failed to load model metrics."),
    );
  }
  return (await response.json()) as ModelMetrics;
}
