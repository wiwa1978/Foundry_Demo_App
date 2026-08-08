import { readPublicApiError } from "@/api/errors";
import type { FetchClient } from "@/api/types";
import type { UseCaseId } from "@/app/types";
import { readServerSentEvents } from "@/features/textChat/sse";
import type {
  Conversation,
  FoundryRequestTrace,
  FoundryResponseTrace,
  ModelResult,
  ReasoningEffort,
  StoredMessage,
} from "@/features/textChat/types";

export const comparisonEndpoint = "/api/compare";
export const comparisonStreamEndpoint = "/api/compare/stream";

export type ComparisonStreamEvent =
  | {
      type: "start";
      conversation: Conversation;
      user_message: StoredMessage;
    }
  | {
      type: "model_completed";
      model: string;
      result:
        | (ModelResult & {
            assistant_message: StoredMessage;
            foundry_request?: FoundryRequestTrace;
            foundry_response?: FoundryResponseTrace;
          })
        | {
            model: string;
            variants: Array<
              ModelResult & {
                assistant_message: StoredMessage;
                foundry_request?: FoundryRequestTrace;
                foundry_response?: FoundryResponseTrace;
              }
            >;
          };
    }
  | { type: "completed"; conversation: Conversation };

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

export async function streamComparison({
  fetchClient,
  request,
  onEvent,
}: {
  fetchClient: FetchClient;
  request: Parameters<typeof compareModels>[1];
  onEvent: (event: ComparisonStreamEvent) => void;
}) {
  const response = await fetchClient(
    comparisonStreamEndpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    { label: "Compare models", request, responseKind: "stream" },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(response, "Model comparison failed."),
    );
  }
  return {
    response,
    events: await readServerSentEvents<ComparisonStreamEvent>(response, onEvent),
  };
}
