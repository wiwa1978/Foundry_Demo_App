import { readPublicApiError } from "@/api/errors";
import type { FetchClient } from "@/api/types";
import type { UseCaseId } from "@/app/types";
import type { ReasoningEffort } from "@/features/textChat/types";

export const comparisonEndpoint = "/api/compare";

export async function compareModels(
  fetchClient: FetchClient,
  request: {
    models: string[];
    prompt: string;
    conversation_id: string | null;
    reasoning_effort: Exclude<ReasoningEffort, "default"> | null;
    use_case: UseCaseId;
  },
) {
  const response = await fetchClient(
    comparisonEndpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    { label: "Compare models", request, responseKind: "json" },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(response, "Model comparison failed."),
    );
  }
  return response;
}
