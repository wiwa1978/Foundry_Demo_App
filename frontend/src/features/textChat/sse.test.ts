import { describe, expect, it, vi } from "vitest";

import { parseServerSentEvent, readServerSentEvents } from "./sse";

function streamingResponse(chunks: Uint8Array[]) {
  return new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

describe("Text Chat SSE", () => {
  it("parses multiline data and ignores comments", () => {
    expect(
      parseServerSentEvent<{ value: number }>(
        ': keepalive\ndata: {"value":\ndata: 1}',
      ),
    ).toEqual({ value: 1 });
  });

  it("handles fragmented CRLF events and final unterminated events", async () => {
    const encoder = new TextEncoder();
    const onEvent = vi.fn();
    const response = streamingResponse([
      encoder.encode('data: {"type":"delta","delta":"hel'),
      encoder.encode('lo"}\r\n\r\ndata: {"type":"completed"}'),
    ]);

    const events = await readServerSentEvents(response, onEvent);

    expect(events).toEqual([
      { type: "delta", delta: "hello" },
      { type: "completed" },
    ]);
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it("rejects responses without a stream body", async () => {
    await expect(
      readServerSentEvents({ body: null } as Response, vi.fn()),
    ).rejects.toThrow("Streaming response body is not available");
  });
});
