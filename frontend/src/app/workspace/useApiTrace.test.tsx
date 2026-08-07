import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useApiTrace } from "./useApiTrace";

describe("useApiTrace", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts entries, inserts responses after requests, and updates requests", () => {
    const { result } = renderHook(useApiTrace);
    let requestId = "";

    act(() => {
      requestId = result.current.append({
        direction: "frontend_api",
        label: "Send prompt",
        method: "POST",
        url: "/api/chat",
        request: { prompt: "private", model: "gpt-4.1" },
      });
      result.current.append({
        direction: "api_foundry",
        label: "Foundry request",
        method: "POST",
        url: "/responses",
      });
      result.current.insertAfter(requestId, {
        direction: "api_frontend",
        label: "Send prompt response",
        method: "RECV",
        url: "/api/chat",
        response: { content: "private answer", ok: true },
      });
      result.current.update(requestId, {
        status: 200,
        durationMs: 12,
        response: { content: "updated private answer" },
      });
    });

    expect(result.current.entries.map((entry) => entry.label)).toEqual([
      "Send prompt",
      "Send prompt response",
      "Foundry request",
    ]);
    expect(result.current.entries[0]).toMatchObject({
      id: "trace-1",
      request: { prompt: "[redacted]", model: "gpt-4.1" },
      status: 200,
      durationMs: 12,
      response: { content: "[redacted]" },
    });
    expect(result.current.entries[1].response).toEqual({
      content: "[redacted]",
      ok: true,
    });
  });

  it("bounds entries at 100 and appends after a missing insertion target", () => {
    const { result } = renderHook(useApiTrace);

    act(() => {
      for (let index = 0; index < 101; index += 1) {
        result.current.append({
          direction: "frontend_api",
          label: `Call ${index}`,
          method: "GET",
          url: `/api/${index}`,
        });
      }
      result.current.insertAfter("missing", {
        direction: "api_frontend",
        label: "Fallback response",
        method: "RECV",
        url: "/api/missing",
      });
    });

    expect(result.current.entries).toHaveLength(100);
    expect(result.current.entries[0].label).toBe("Call 2");
    expect(result.current.entries.at(-1)?.label).toBe("Fallback response");
  });

  it("formats Foundry callbacks and exposes clear, filter, and drawer operations", () => {
    const { result } = renderHook(useApiTrace);

    act(() => {
      result.current.appendFoundryTrace({
        api_surface: "responses",
        method: "POST",
        path: "/responses",
        payload: { input: "private" },
      });
      result.current.appendFoundryResponseTrace({
        api_surface: "chat_completions",
        events: [{ delta: "private" }],
      });
      result.current.show();
      result.current.setFilter("messages");
    });

    expect(result.current.open).toBe(true);
    expect(result.current.filter).toBe("messages");
    expect(result.current.entries).toEqual([
      expect.objectContaining({
        label: "Foundry Responses API",
        request: { input: "[redacted]" },
      }),
      expect.objectContaining({
        label: "Foundry Chat Completions API response",
        response: [{ delta: "[redacted]" }],
      }),
    ]);

    act(() => {
      result.current.close();
      result.current.clear();
    });
    expect(result.current.open).toBe(false);
    expect(result.current.entries).toEqual([]);
  });

  it("traces request and ordered response while suppressing auth response data", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ answer: "visible" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ email: "private@example.com" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    const { result } = renderHook(useApiTrace);

    await act(async () => {
      await result.current.tracedFetch(
        "/api/chat",
        { method: "POST", body: JSON.stringify({ prompt: "private" }) },
        { label: "Chat", responseKind: "json" },
      );
      await result.current.tracedFetch(
        "/api/auth/me",
        {},
        {
          label: "Load current user",
          responseKind: "json",
          traceResponse: false,
        },
      );
    });

    await waitFor(() => expect(result.current.entries).toHaveLength(3));
    expect(result.current.entries.map((entry) => entry.label)).toEqual([
      "Chat",
      "Chat response",
      "Load current user",
    ]);
    expect(result.current.entries[1].response).toEqual({ answer: "visible" });
    expect(result.current.entries[2].response).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
