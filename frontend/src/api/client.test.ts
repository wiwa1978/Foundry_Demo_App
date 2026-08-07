import { describe, expect, it, vi } from "vitest";

import { createTracedFetch } from "@/api/client";

describe("createTracedFetch", () => {
  it("traces a JSON request and response without consuming the response", async () => {
    const appendRequest = vi.fn().mockReturnValue("trace-1");
    const updateRequest = vi.fn();
    const appendResponse = vi.fn();
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ value: "ok" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = createTracedFetch(
      { appendRequest, updateRequest, appendResponse },
      fetchImplementation,
    );

    const response = await client(
      "/example",
      { method: "POST", body: JSON.stringify({ prompt: "hello" }) },
      { label: "Example request", responseKind: "json" },
    );

    expect(appendRequest).toHaveBeenCalledWith({
      label: "Example request",
      method: "POST",
      url: "/example",
      request: { prompt: "hello" },
    });
    expect(updateRequest).toHaveBeenCalledWith(
      "trace-1",
      expect.objectContaining({ status: 201 }),
    );
    expect(appendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        afterId: "trace-1",
        label: "Example request response",
        response: { value: "ok" },
      }),
    );
    await expect(response.json()).resolves.toEqual({ value: "ok" });
  });

  it("records failures and rethrows them", async () => {
    const error = new Error("network unavailable");
    const updateRequest = vi.fn();
    const client = createTracedFetch(
      {
        appendRequest: vi.fn().mockReturnValue("trace-2"),
        updateRequest,
        appendResponse: vi.fn(),
      },
      vi.fn().mockRejectedValue(error),
    );

    await expect(client("/failure")).rejects.toBe(error);
    expect(updateRequest).toHaveBeenCalledWith(
      "trace-2",
      expect.objectContaining({ error: "network unavailable" }),
    );
  });

  it("does not buffer streaming responses", async () => {
    const appendResponse = vi.fn();
    const client = createTracedFetch(
      {
        appendRequest: vi.fn().mockReturnValue("trace-3"),
        updateRequest: vi.fn(),
        appendResponse,
      },
      vi.fn().mockResolvedValue(new Response("data: event\n\n")),
    );

    const response = await client("/stream", {}, { responseKind: "stream" });

    expect(appendResponse).not.toHaveBeenCalled();
    await expect(response.text()).resolves.toBe("data: event\n\n");
  });
});
