import type { ApiTraceEntry } from "@/app/workspace/contracts";

const sensitiveTraceKeys = new Set([
  "access_token",
  "api-key",
  "api_key",
  "apikey",
  "audio",
  "audio_base64",
  "authorization",
  "b64_json",
  "client_secret",
  "content",
  "delta",
  "input",
  "instructions",
  "messages",
  "password",
  "prompt",
  "refresh_token",
  "secret",
  "system_prompt",
  "text",
  "token",
]);

export function redactTracePayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, 100).map(redactTracePayload);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sensitiveTraceKeys.has(key.toLowerCase())
          ? "[redacted]"
          : redactTracePayload(item),
      ]),
    );
  }
  if (typeof value === "string" && value.length > 500) {
    return `[redacted ${value.length} characters]`;
  }
  return value;
}

export function formatTraceTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

export function isMessageTraceEntry(entry: ApiTraceEntry) {
  if (entry.direction === "api_foundry" || entry.direction === "foundry_api") {
    return true;
  }
  return (
    entry.url.startsWith("/api/chat") ||
    entry.url.startsWith("/api/compare") ||
    entry.url.startsWith("/api/documents") ||
    entry.url.startsWith("/api/voice")
  );
}

export function formatTraceDirection(direction: ApiTraceEntry["direction"]) {
  if (direction === "api_foundry") {
    return "API -> Foundry";
  }
  if (direction === "foundry_api") {
    return "Foundry -> API";
  }
  if (direction === "api_frontend") {
    return "API -> Frontend";
  }
  return "Frontend -> API";
}

export function formatTraceValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  const formatted = JSON.stringify(value, null, 2);
  return formatted ?? String(value);
}

export function formatApiSurface(apiSurface: string) {
  if (apiSurface === "responses") {
    return "Responses API";
  }
  if (apiSurface === "chat_completions") {
    return "Chat Completions API";
  }
  if (apiSurface === "embeddings") {
    return "Embeddings API";
  }
  return apiSurface;
}
