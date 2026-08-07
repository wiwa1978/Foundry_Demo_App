import type { FetchClient, ModelModality, ModelsResponse } from "@/api/types";

const modelsEndpoint = "/api/models";

export type ModelRegistrationResponse = {
  detail?: string;
  settings: { model: string; modalities: ModelModality[] };
  models?: string[];
};

export async function discoverModels(
  fetchClient: FetchClient,
  signal: AbortSignal,
) {
  const response = await fetchClient(
    modelsEndpoint,
    { signal },
    { label: "Discover Foundry deployments", responseKind: "json" },
  );
  const data = (await response.json()) as ModelsResponse;
  if (!response.ok) {
    throw new Error("Failed to discover Foundry deployments.");
  }
  return data;
}

export async function registerModel(fetchClient: FetchClient, model: string) {
  const request = { model };
  const response = await fetchClient(
    modelsEndpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    { label: "Register model endpoint", request, responseKind: "json" },
  );
  return {
    response,
    data: (await response.json()) as ModelRegistrationResponse,
  };
}
