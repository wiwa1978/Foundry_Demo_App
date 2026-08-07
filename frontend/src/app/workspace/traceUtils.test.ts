import { describe, expect, it } from "vitest";

import type { ApiTraceEntry } from "@/app/workspace/contracts";
import {
  formatApiSurface,
  formatTraceDirection,
  formatTraceTimestamp,
  formatTraceValue,
  isMessageTraceEntry,
  redactTracePayload,
} from "@/app/workspace/traceUtils";

function traceEntry(overrides: Partial<ApiTraceEntry> = {}): ApiTraceEntry {
  return {
    id: "trace-1",
    timestamp: "2025-01-02T15:04:05.000Z",
    direction: "frontend_api",
    label: "Request",
    method: "POST",
    url: "/api/config",
    ...overrides,
  };
}

describe("trace utilities", () => {
  it("recursively redacts message content and credentials case-insensitively", () => {
    const payload = {
      model: "gpt-4.1",
      Prompt: "private user prompt",
      headers: {
        Authorization: "Bearer secret-token",
        "Api-Key": "private-api-key",
      },
      credentials: {
        access_token: "access",
        refresh_token: "refresh",
        client_secret: "client-secret",
        password: "password",
      },
      response: {
        choices: [
          { DELTA: { content: "private completion" }, finish_reason: "stop" },
        ],
      },
    };

    expect(redactTracePayload(payload)).toEqual({
      model: "gpt-4.1",
      Prompt: "[redacted]",
      headers: {
        Authorization: "[redacted]",
        "Api-Key": "[redacted]",
      },
      credentials: {
        access_token: "[redacted]",
        refresh_token: "[redacted]",
        client_secret: "[redacted]",
        password: "[redacted]",
      },
      response: {
        choices: [{ DELTA: "[redacted]", finish_reason: "stop" }],
      },
    });
  });

  it("bounds arrays and redacts oversized strings while preserving safe primitive values", () => {
    const values = Array.from({ length: 105 }, (_, index) => ({
      index,
      safe: true,
    }));
    const redacted = redactTracePayload(values);

    expect(redacted).toEqual(values.slice(0, 100));
    expect(redactTracePayload("x".repeat(500))).toBe("x".repeat(500));
    expect(redactTracePayload("x".repeat(501))).toBe(
      "[redacted 501 characters]",
    );
    expect(redactTracePayload(null)).toBeNull();
    expect(redactTracePayload(42)).toBe(42);
  });

  it("includes Foundry traffic and supported message endpoints in the message filter", () => {
    expect(isMessageTraceEntry(traceEntry({ direction: "api_foundry" }))).toBe(
      true,
    );
    expect(isMessageTraceEntry(traceEntry({ direction: "foundry_api" }))).toBe(
      true,
    );
    expect(isMessageTraceEntry(traceEntry({ url: "/api/chat/stream" }))).toBe(
      true,
    );
    expect(
      isMessageTraceEntry(traceEntry({ url: "/api/compare?model=gpt-4.1" })),
    ).toBe(true);
    expect(
      isMessageTraceEntry(traceEntry({ url: "/api/documents/question" })),
    ).toBe(true);
    expect(
      isMessageTraceEntry(traceEntry({ url: "/api/voice/traditional" })),
    ).toBe(true);
    expect(
      isMessageTraceEntry(traceEntry({ url: "/api/images/generate" })),
    ).toBe(false);
    expect(isMessageTraceEntry(traceEntry({ url: "/api/config" }))).toBe(false);
  });

  it("formats timestamps, directions, values, and API surface labels", () => {
    const timestamp = "2025-01-02T15:04:05.000Z";
    const expectedTimestamp = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(timestamp));

    expect(formatTraceTimestamp(timestamp)).toBe(expectedTimestamp);
    expect(formatTraceDirection("api_foundry")).toBe("API -> Foundry");
    expect(formatTraceDirection("foundry_api")).toBe("Foundry -> API");
    expect(formatTraceDirection("api_frontend")).toBe("API -> Frontend");
    expect(formatTraceDirection("frontend_api")).toBe("Frontend -> API");
    expect(formatTraceValue("already formatted")).toBe("already formatted");
    expect(formatTraceValue({ ok: true })).toBe('{\n  "ok": true\n}');
    expect(formatTraceValue(undefined)).toBe("undefined");
    expect(formatApiSurface("responses")).toBe("Responses API");
    expect(formatApiSurface("chat_completions")).toBe("Chat Completions API");
    expect(formatApiSurface("embeddings")).toBe("Embeddings API");
    expect(formatApiSurface("realtime")).toBe("realtime");
  });
});
