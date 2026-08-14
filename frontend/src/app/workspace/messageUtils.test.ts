import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAssistantMessage,
  createUserMessage,
  mapStoredMessage,
} from "@/app/workspace/messageUtils";
import type { ModelResult, StoredMessage } from "@/features/textChat/types";

const generatedId = "00000000-0000-4000-8000-000000000001";
const now = new Date("2025-02-03T04:05:06.000Z");

describe("message utilities", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.spyOn(crypto, "randomUUID").mockReturnValue(generatedId);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("creates a user message with a generated identity and current timestamp", () => {
    expect(createUserMessage("Hello Foundry")).toEqual({
      id: generatedId,
      role: "user",
      content: "Hello Foundry",
      created_at: now.toISOString(),
    });
  });

  it("preserves assistant metadata and normalizes absent content", () => {
    const result: ModelResult = {
      model: "gpt-4.1",
      routed_model: "gpt-5.4-mini",
      api_surface: "responses",
      duration_ms: 125,
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      error: "partial failure",
      guardrail_variant: "policy_2",
      guardrail_policy_name: "Strict",
      guardrail_results: { blocked: false },
      pending: true,
    };

    expect(createAssistantMessage(result)).toEqual({
      id: generatedId,
      role: "assistant",
      model: "gpt-4.1",
      routed_model: "gpt-5.4-mini",
      api_surface: "responses",
      content: "",
      created_at: now.toISOString(),
      duration_ms: 125,
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      error: "partial failure",
      guardrail_variant: "policy_2",
      guardrail_policy_name: "Strict",
      guardrail_results: { blocked: false },
      pending: true,
    });
  });

  it("maps persisted nullable fields to optional UI fields without losing guardrail nulls", () => {
    const stored: StoredMessage = {
      id: "message-1",
      conversation_id: "conversation-1",
      role: "assistant",
      content: "Stored response",
      model: null,
      api_surface: null,
      duration_ms: null,
      usage: null,
      error: null,
      guardrail_variant: null,
      guardrail_policy_name: null,
      guardrail_results: null,
      created_at: "2025-01-01T00:00:00.000Z",
    };

    expect(mapStoredMessage(stored)).toEqual({
      id: "message-1",
      role: "assistant",
      content: "Stored response",
      created_at: "2025-01-01T00:00:00.000Z",
      model: undefined,
      routed_model: undefined,
      api_surface: undefined,
      duration_ms: undefined,
      usage: undefined,
      error: undefined,
      guardrail_variant: null,
      guardrail_policy_name: null,
      guardrail_results: null,
    });
  });
});
