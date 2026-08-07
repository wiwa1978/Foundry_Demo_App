import type {
  FetchClient,
  TraceCallbacks,
  TracedFetchOptions,
} from "@/api/types";

function parseRequestBody(body: BodyInit | null | undefined) {
  if (typeof body !== "string") {
    return undefined;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

async function readTraceResponse(
  response: Response,
  responseKind?: TracedFetchOptions["responseKind"],
) {
  if (responseKind === "stream") {
    return "text/event-stream";
  }

  const clone = response.clone();
  const contentType = clone.headers.get("content-type") ?? "";
  if (responseKind === "json" || contentType.includes("application/json")) {
    try {
      return (await clone.json()) as unknown;
    } catch {
      return `${response.status} ${response.statusText}`;
    }
  }
  if (responseKind === "text" || contentType.startsWith("text/")) {
    return clone.text();
  }
  return `${response.status} ${response.statusText}`;
}

export function createTracedFetch(
  callbacks: TraceCallbacks,
  fetchImplementation: typeof fetch = globalThis.fetch,
): FetchClient {
  return async (url, init = {}, options = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    const label = options.label ?? `${method} ${url}`;
    const traceId = callbacks.appendRequest({
      label,
      method,
      url,
      request: options.request ?? parseRequestBody(init.body),
    });
    const started = performance.now();

    try {
      const response = await fetchImplementation(url, init);
      const durationMs = Math.round(performance.now() - started);
      const responsePayload =
        options.traceResponse === false
          ? undefined
          : await readTraceResponse(response, options.responseKind);
      callbacks.updateRequest(traceId, { status: response.status, durationMs });
      if (
        options.responseKind !== "stream" &&
        options.traceResponse !== false
      ) {
        callbacks.appendResponse({
          label: `${label} response`,
          method: "RECV",
          url,
          status: response.status,
          durationMs,
          response: responsePayload,
          afterId: traceId,
        });
      }
      return response;
    } catch (error) {
      callbacks.updateRequest(traceId, {
        durationMs: Math.round(performance.now() - started),
        error: error instanceof Error ? error.message : "Request failed",
      });
      throw error;
    }
  };
}
