import type { FetchClient } from "@/api/types";

const guardrailPoliciesEndpoint = "/api/guardrails/policies";
const deploymentPolicyEndpoint = "/api/guardrails/deployment-policy";

export function listGuardrailPolicies(
  fetchClient: FetchClient,
  signal?: AbortSignal,
) {
  return fetchClient(
    guardrailPoliciesEndpoint,
    { signal },
    { label: "List Foundry guardrails", responseKind: "json" },
  );
}

export function loadDeploymentGuardrailPolicy(
  fetchClient: FetchClient,
  model: string,
  signal?: AbortSignal,
) {
  return fetchClient(
    `${deploymentPolicyEndpoint}?model=${encodeURIComponent(model)}`,
    { signal },
    { label: "Load deployment guardrail", responseKind: "json" },
  );
}
