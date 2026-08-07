import { readJsonResponse } from "@/api/errors";
import type {
  AdminConfig,
  AdminDeploymentDraft,
  FetchClient,
  ModelModality,
} from "@/api/types";

const adminConfigEndpoint = "/api/admin/deployments/config";
const deploymentsEndpoint = "/api/admin/deployments";

export type CreateDeploymentResponse = {
  detail?: string;
  settings: { model: string; modalities: ModelModality[] };
  deployment: { status: string };
};

export async function loadAdminConfig(
  fetchClient: FetchClient,
  signal?: AbortSignal,
) {
  const response = await fetchClient(
    adminConfigEndpoint,
    { signal },
    { label: "Load deployment admin config", responseKind: "json" },
  );
  return {
    response,
    data: await readJsonResponse<Partial<AdminConfig> & { detail?: string }>(
      response,
      {},
    ),
  };
}

export async function createAdminDeployment(
  fetchClient: FetchClient,
  draft: AdminDeploymentDraft,
  signal?: AbortSignal,
) {
  const response = await fetchClient(
    deploymentsEndpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
      signal,
    },
    {
      label: "Create Foundry deployment",
      request: draft,
      responseKind: "json",
    },
  );
  return {
    response,
    data: (await response.json()) as CreateDeploymentResponse,
  };
}
