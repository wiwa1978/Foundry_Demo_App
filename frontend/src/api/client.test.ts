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

  it("preserves non-JSON requests and captures text or headerless responses", async () => {
    const appendRequest = vi
      .fn()
      .mockReturnValueOnce("trace-4")
      .mockReturnValueOnce("trace-5");
    const appendResponse = vi.fn();
    const client = createTracedFetch(
      {
        appendRequest,
        updateRequest: vi.fn(),
        appendResponse,
      },
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response("plain text", {
            headers: { "Content-Type": "text/plain" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(null, {
            status: 204,
            statusText: "No Content",
          }),
        ),
    );

    await client("/text", { method: "post", body: "not-json" });
    await client(
      "/binary",
      { body: "ignored" },
      { request: { source: "override" } },
    );

    expect(appendRequest).toHaveBeenNthCalledWith(1, {
      label: "POST /text",
      method: "POST",
      url: "/text",
      request: "not-json",
    });
    expect(appendRequest).toHaveBeenNthCalledWith(2, {
      label: "GET /binary",
      method: "GET",
      url: "/binary",
      request: { source: "override" },
    });
    expect(appendResponse).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ response: "plain text" }),
    );
    expect(appendResponse).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ response: "204 No Content" }),
    );
  });

  it("summarizes malformed JSON and records non-Error failures", async () => {
    const updateRequest = vi.fn();
    const appendResponse = vi.fn();
    const client = createTracedFetch(
      {
        appendRequest: vi
          .fn()
          .mockReturnValueOnce("trace-6")
          .mockReturnValueOnce("trace-7"),
        updateRequest,
        appendResponse,
      },
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response("not-json", {
            status: 502,
            statusText: "Bad Gateway",
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockRejectedValueOnce("offline"),
    );

    await client("/invalid-json", {}, { responseKind: "json" });
    await expect(client("/string-error")).rejects.toBe("offline");

    expect(appendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ response: "502 Bad Gateway" }),
    );
    expect(updateRequest).toHaveBeenLastCalledWith(
      "trace-7",
      expect.objectContaining({ error: "Request failed" }),
    );
  });
});
