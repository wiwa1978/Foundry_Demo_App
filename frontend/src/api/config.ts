import type { ConfigResponse, FetchClient } from "@/api/types";

const configEndpoint = "/api/config";

export async function loadConfig(
  fetchClient: FetchClient,
  signal: AbortSignal,
) {
  const response = await fetchClient(
    configEndpoint,
    { signal },
    { label: "Load Foundry config", responseKind: "json" },
  );
  if (!response.ok) {
    throw new Error(`Failed to load configuration (${response.status}).`);
  }
  return (await response.json()) as ConfigResponse;
}
