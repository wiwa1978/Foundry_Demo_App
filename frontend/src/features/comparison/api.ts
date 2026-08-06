import type { FetchClient } from "@/features/textChat/api";
import type { ReasoningEffort } from "@/features/textChat/types";
import type { UseCaseId } from "@/app/types";

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
    "/api/compare",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    { label: "Compare models", request, responseKind: "json" },
  );
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? "Model comparison failed.");
  }
  return response;
}
