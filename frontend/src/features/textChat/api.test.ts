import { describe, expect, it, vi } from "vitest";

import { streamTextChat } from "./api";
import type { TextChatRequest } from "./types";

const request: TextChatRequest = {
  model: "gpt-test",
  prompt: "Hello",
  conversation_id: null,
  reasoning_effort: null,
  guardrail_comparison: false,
  use_case: "text_chat",
};

describe("streamTextChat", () => {
  it("posts the exact Text Chat contract and consumes events", async () => {
    const fetchClient = vi.fn().mockResolvedValue(
      new Response('data: {"type":"delta","delta":"Hi"}\n\n', {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    const onEvent = vi.fn();

    const result = await streamTextChat({
      request,
      fetchClient,
      signal: new AbortController().signal,
      onEvent,
    });

    expect(fetchClient).toHaveBeenCalledWith(
      "/api/chat/stream",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(request),
      }),
      expect.objectContaining({ responseKind: "stream" }),
    );
    expect(result.events).toEqual([{ type: "delta", delta: "Hi" }]);
  });

  it("returns a public HTTP error", async () => {
    const fetchClient = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Conversation not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      streamTextChat({
        request,
        fetchClient,
        signal: new AbortController().signal,
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow("Conversation not found.");
  });
});
