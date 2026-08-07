import type { FetchClient, ModelSettings } from "@/api/types";

const modelSettingsEndpoint = "/api/model-settings";

export async function loadModelSettings(
  fetchClient: FetchClient,
  model: string,
  label: string,
  signal?: AbortSignal,
) {
  return fetchClient(
    `${modelSettingsEndpoint}?model=${encodeURIComponent(model)}`,
    { signal },
    { label, responseKind: "json" },
  );
}

export async function saveModelSettings(
  fetchClient: FetchClient,
  settings: ModelSettings,
  label: string,
  signal?: AbortSignal,
) {
  return fetchClient(
    modelSettingsEndpoint,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
      signal,
    },
    { label, request: settings, responseKind: "json" },
  );
}
