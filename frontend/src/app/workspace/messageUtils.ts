import type {
  ChatMessage,
  ModelResult,
  StoredMessage,
} from "@/features/textChat/types";

export function createUserMessage(content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    content,
    created_at: new Date().toISOString(),
  };
}

export function createAssistantMessage(result: ModelResult): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    model: result.model,
    routed_model: result.routed_model ?? undefined,
    api_surface: result.api_surface,
    content: result.content ?? "",
    created_at: new Date().toISOString(),
    duration_ms: result.duration_ms,
    usage: result.usage,
    error: result.error,
    guardrail_variant: result.guardrail_variant,
    guardrail_policy_name: result.guardrail_policy_name,
    guardrail_results: result.guardrail_results,
    pending: result.pending,
  };
}

export function mapStoredMessage(message: StoredMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    created_at: message.created_at,
    model: message.model ?? undefined,
    routed_model: message.routed_model ?? undefined,
    api_surface: message.api_surface ?? undefined,
    duration_ms: message.duration_ms ?? undefined,
    usage: message.usage ?? undefined,
    error: message.error ?? undefined,
    guardrail_variant: message.guardrail_variant,
    guardrail_policy_name: message.guardrail_policy_name,
    guardrail_results: message.guardrail_results,
  };
}
