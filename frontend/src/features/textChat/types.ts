import type { UseCaseId } from "@/app/types";

export type Usage = {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
};

export type GuardrailVariant = "baseline" | "guarded" | "policy_1" | "policy_2";
export type ReasoningEffort =
  "default" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type ModelResult = {
  model: string;
  api_surface?: "responses" | "chat_completions";
  content?: string;
  duration_ms?: number;
  usage?: Usage;
  error?: string;
  guardrail_variant?: GuardrailVariant | null;
  guardrail_policy_name?: string | null;
  guardrail_results?: Record<string, unknown> | null;
  pending?: boolean;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  model?: string;
  api_surface?: "responses" | "chat_completions";
  duration_ms?: number;
  usage?: Usage;
  error?: string;
  guardrail_variant?: GuardrailVariant | null;
  guardrail_policy_name?: string | null;
  guardrail_results?: Record<string, unknown> | null;
  pending?: boolean;
};

export type Conversation = {
  id: string;
  title: string;
  use_case: UseCaseId;
  created_at: string;
  updated_at: string;
};

export type StoredMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  model: string | null;
  api_surface: "responses" | "chat_completions" | null;
  duration_ms: number | null;
  usage: Usage | null;
  error: string | null;
  guardrail_variant: GuardrailVariant | null;
  guardrail_policy_name: string | null;
  guardrail_results: Record<string, unknown> | null;
  created_at: string;
};

export type FoundryRequestTrace = {
  api_surface: string;
  method: "POST";
  path: string;
  payload: unknown;
};

export type FoundryResponseTrace = {
  api_surface: string;
  payload?: unknown;
  events?: unknown[];
  extracted?: { content: string; usage: Usage };
};

export type DocumentSource = {
  document_id: string;
  filename: string;
  chunk_index: number;
  content: string;
  score: number;
};

export type ChatStreamEvent =
  | {
      type: "start";
      model: string;
      api_surface: "responses" | "chat_completions";
      conversation: Conversation;
      user_message: StoredMessage;
      guardrail_comparison?: boolean;
      guardrail_policy_names?: string[];
    }
  | { type: "foundry_request"; request: FoundryRequestTrace }
  | { type: "foundry_response"; response: FoundryResponseTrace }
  | {
      type: "retrieval";
      sources: DocumentSource[];
      embedding: {
        model: string;
        duration_ms: number;
        dimensions: number;
        foundry_request?: FoundryRequestTrace;
        foundry_response?: FoundryResponseTrace;
      };
    }
  | { type: "delta"; delta: string }
  | {
      type: "completed";
      conversation: Conversation;
      assistant_message: StoredMessage;
    }
  | {
      type: "error";
      error: string;
      conversation?: Conversation;
      assistant_message?: StoredMessage;
    }
  | {
      type: "variant_completed";
      conversation: Conversation;
      result: ModelResult & {
        assistant_message: StoredMessage;
        foundry_request?: FoundryRequestTrace;
        foundry_response?: FoundryResponseTrace;
      };
    }
  | { type: "comparison_completed"; conversation: Conversation };

export type TextChatRequest = {
  model: string;
  prompt: string;
  conversation_id: string | null;
  reasoning_effort: Exclude<ReasoningEffort, "default"> | null;
  guardrail_comparison: boolean;
  use_case: UseCaseId;
};
