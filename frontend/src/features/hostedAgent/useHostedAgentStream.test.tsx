import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FetchClient } from "@/api/types";

import { useHostedAgentStream } from "./useHostedAgentStream";

function sseResponse(events: unknown[]) {
  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

describe("useHostedAgentStream", () => {
  it("applies streamed configuration, step updates, and answer deltas", async () => {
    const fetchClient = vi.fn<FetchClient>().mockResolvedValue(
      sseResponse([
        {
          type: "start",
          message: "Question",
          agent_name: "hosted-assistant",
          project_endpoint: "https://example.test/projects/demo",
        },
        {
          type: "step",
          label: "Invoke agent",
          status: "running",
          detail: "Connecting",
        },
        { type: "step", label: "Invoke agent", status: "done" },
        { type: "delta", delta: "Hello " },
        { type: "delta", delta: "world" },
        { type: "completed", answer: "" },
      ]),
    );
    const { result } = renderHook(() => useHostedAgentStream({ fetchClient }));

    act(() => result.current.setMessage("  Question  "));
    await act(async () => result.current.submit());

    expect(fetchClient).toHaveBeenCalledWith(
      "/api/hosted-agent/stream",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "Question" }),
        signal: expect.any(AbortSignal),
      }),
      expect.objectContaining({ responseKind: "stream" }),
    );
    expect(result.current.message).toBe("");
    expect(result.current.answer).toBe("Hello world");
    expect(result.current.runConfig).toEqual({
      agentName: "hosted-assistant",
      projectEndpoint: "https://example.test/projects/demo",
    });
    expect(result.current.steps).toEqual([
      {
        id: "Invoke agent",
        label: "Invoke agent",
        status: "done",
        detail: null,
      },
    ]);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.error).toBe("");
  });

  it("ignores empty submissions and exposes stream errors", async () => {
    const fetchClient = vi
      .fn<FetchClient>()
      .mockResolvedValue(
        sseResponse([{ type: "error", error: "Agent unavailable" }]),
      );
    const { result } = renderHook(() => useHostedAgentStream({ fetchClient }));

    await act(async () => result.current.submit());
    expect(fetchClient).not.toHaveBeenCalled();

    act(() => result.current.setMessage("Question"));
    await act(async () => result.current.submit());

    expect(result.current.error).toBe("Agent unavailable");
    expect(result.current.isRunning).toBe(false);

    act(() => result.current.reset());
    expect(result.current.message).toBe("");
    expect(result.current.error).toBe("");
    expect(result.current.steps).toEqual([]);
  });

  it("includes the selected variant key in the request body", async () => {
    const fetchClient = vi.fn<FetchClient>().mockResolvedValue(
      sseResponse([
        {
          type: "start",
          message: "Question",
          agent_name: "agent-azd",
          agent_key: "azd",
          project_endpoint: "https://example.test/projects/demo",
        },
        { type: "completed", answer: "Hi" },
      ]),
    );
    const variants = [
      { key: "code", label: "Hosted Agent (Code)", agentName: "agent-code" },
      { key: "azd", label: "Hosted Agent (AZD)", agentName: "agent-azd" },
    ];
    const { result } = renderHook(() =>
      useHostedAgentStream({ fetchClient, variants }),
    );

    expect(result.current.variantKey).toBe("code");
    act(() => result.current.setVariantKey("azd"));
    act(() => result.current.setMessage("Question"));
    await act(async () => result.current.submit());

    expect(fetchClient).toHaveBeenCalledWith(
      "/api/hosted-agent/stream",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "Question", agent_key: "azd" }),
      }),
      expect.objectContaining({ responseKind: "stream" }),
    );
  });
});
