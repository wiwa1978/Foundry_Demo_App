import { readJsonResponse } from "@/api/errors";
import type {
  AdminConfig,
  AdminDeploymentDraft,
  FetchClient,
  ModelRouterRoutingMode,
  ModelRouterRoutingSettings,
  ModelModality,
  UseCaseModelMap,
  UseCaseModelMapSettings,
  UseCaseResourceSettings,
} from "@/api/types";

const adminConfigEndpoint = "/api/admin/deployments/config";
const deploymentsEndpoint = "/api/admin/deployments";
const modelRouterRoutingEndpoint = "/api/admin/model-router/routing";
const liveTranslationSettingsEndpoint =
  "/api/admin/use-case-settings/live_translation";
const useCaseModelMapEndpoint = "/api/admin/use-case-model-map";

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

export async function loadModelRouterRouting(
  fetchClient: FetchClient,
  deployment: string,
  signal?: AbortSignal,
) {
  const response = await fetchClient(
    `${modelRouterRoutingEndpoint}?deployment=${encodeURIComponent(deployment)}`,
    { signal },
    { label: "Load model router routing", responseKind: "json" },
  );
  return {
    response,
    data: await readJsonResponse<
      ModelRouterRoutingSettings & { detail?: string }
    >(response, { deployment_name: deployment, mode: "balanced" }),
  };
}

export async function saveModelRouterRouting(
  fetchClient: FetchClient,
  deployment: string,
  mode: ModelRouterRoutingMode,
) {
  const response = await fetchClient(
    `${modelRouterRoutingEndpoint}?deployment=${encodeURIComponent(deployment)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    },
    {
      label: "Save model router routing",
      request: { deployment, mode },
      responseKind: "json",
    },
  );
  return {
    response,
    data: await readJsonResponse<
      ModelRouterRoutingSettings & { detail?: string }
    >(response, { deployment_name: deployment, mode }),
  };
}

export async function loadLiveTranslationSettings(
  fetchClient: FetchClient,
  signal?: AbortSignal,
) {
  const response = await fetchClient(
    liveTranslationSettingsEndpoint,
    { signal },
    { label: "Load Live Interpreter resource", responseKind: "json" },
  );
  return {
    response,
    data: await readJsonResponse<UseCaseResourceSettings & { detail?: string }>(
      response,
      { use_case: "live_translation", binding: "", available_bindings: [] },
    ),
  };
}

export async function saveLiveTranslationSettings(
  fetchClient: FetchClient,
  settings: Pick<UseCaseResourceSettings, "binding">,
) {
  const response = await fetchClient(
    liveTranslationSettingsEndpoint,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    },
    {
      label: "Save Live Interpreter resource",
      request: settings,
      responseKind: "json",
    },
  );
  return {
    response,
    data: await readJsonResponse<UseCaseResourceSettings & { detail?: string }>(
      response,
      { use_case: "live_translation", binding: "", available_bindings: [] },
    ),
  };
}

export async function loadUseCaseModelMapSettings(
  fetchClient: FetchClient,
  signal?: AbortSignal,
) {
  const response = await fetchClient(
    useCaseModelMapEndpoint,
    { signal },
    { label: "Load use case model map", responseKind: "json" },
  );
  return {
    response,
    data: await readJsonResponse<UseCaseModelMapSettings & { detail?: string }>(
      response,
      { use_case_model_map: {}, bucket_names: [] },
    ),
  };
}

export async function saveUseCaseModelMapSettings(
  fetchClient: FetchClient,
  useCaseModelMap: UseCaseModelMap,
) {
  const response = await fetchClient(
    useCaseModelMapEndpoint,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ use_case_model_map: useCaseModelMap }),
    },
    {
      label: "Save use case model map",
      request: { use_case_model_map: useCaseModelMap },
      responseKind: "json",
    },
  );
  return {
    response,
    data: await readJsonResponse<UseCaseModelMapSettings & { detail?: string }>(
      response,
      { use_case_model_map: {}, bucket_names: [] },
    ),
  };
}
