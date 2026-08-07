import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadDeploymentGuardrailPolicy } from "@/api/guardrails";
import { loadModelSettings } from "@/api/modelSettings";
import type {
  DeploymentGuardrailPolicy,
  FetchClient,
  ModelSettings,
} from "@/api/types";

import { useGuardrailComparison } from "./useGuardrailComparison";

vi.mock("@/api/guardrails", () => ({
  loadDeploymentGuardrailPolicy: vi.fn(),
}));
vi.mock("@/api/modelSettings", () => ({ loadModelSettings: vi.fn() }));

const fetchClient = vi.fn<FetchClient>();

function settings(model: string, policies: string[]): ModelSettings {
  return {
    model,
    api_surface: "responses",
    modalities: ["text"],
    system_prompt: "Be concise.",
    temperature: 0.7,
    top_p: 1,
    max_tokens: 1024,
    repetition_penalty: 1,
    guardrail_policy_names: policies,
  };
}

function deploymentPolicy(
  model: string,
  policyName: string | null = "Microsoft.DefaultV2",
): DeploymentGuardrailPolicy {
  return { deployment_name: model, policy_name: policyName };
}

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function setup(activeModel = "model-a") {
  return renderHook(
    ({ model }) => useGuardrailComparison({ fetchClient, activeModel: model }),
    { initialProps: { model: activeModel } },
  );
}

describe("useGuardrailComparison", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("enables and disables a configured policy pair", async () => {
    vi.mocked(loadModelSettings).mockResolvedValue(
      response(settings("model-a", ["Policy A", "Policy B"])),
    );
    vi.mocked(loadDeploymentGuardrailPolicy).mockResolvedValue(
      response(deploymentPolicy("model-a", "Assigned Policy")),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.enabled).toBe(true);
    expect(result.current.activePolicies).toEqual(["Policy A", "Policy B"]);
    expect(result.current.deploymentPolicy?.policy_name).toBe(
      "Assigned Policy",
    );
    expect(loadModelSettings).toHaveBeenCalledWith(
      fetchClient,
      "model-a",
      "Load guardrail comparison settings",
      expect.any(AbortSignal),
    );

    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.enabled).toBe(false);
    expect(result.current.error).toBe("");
    expect(loadModelSettings).toHaveBeenCalledOnce();
  });

  it("rejects models without exactly two configured policies", async () => {
    vi.mocked(loadModelSettings).mockResolvedValue(
      response(settings("model-a", ["Policy A"])),
    );
    vi.mocked(loadDeploymentGuardrailPolicy).mockResolvedValue(
      response(deploymentPolicy("model-a")),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.enabled).toBe(false);
    expect(result.current.activePolicies).toEqual([]);
    expect(result.current.error).toBe(
      "Configure two guardrails in model settings before enabling this test.",
    );
  });

  it("reports settings and deployment-policy request failures", async () => {
    vi.mocked(loadModelSettings)
      .mockResolvedValueOnce(response({}, 500))
      .mockResolvedValueOnce(
        response(settings("model-a", ["Policy A", "Policy B"])),
      );
    vi.mocked(loadDeploymentGuardrailPolicy).mockImplementation(() =>
      Promise.resolve(response({}, 500)),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.error).toBe("Failed to load guardrail settings.");

    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.error).toBe(
      "Failed to load the deployment guardrail.",
    );
    expect(result.current.enabled).toBe(false);
  });

  it("resets on active-model change and ignores the stale request", async () => {
    const staleSettings = deferred<Response>();
    const staleDeployment = deferred<Response>();
    vi.mocked(loadModelSettings).mockReturnValue(staleSettings.promise);
    vi.mocked(loadDeploymentGuardrailPolicy).mockReturnValue(
      staleDeployment.promise,
    );
    const { result, rerender } = setup();

    let toggle: Promise<void> = Promise.resolve();
    act(() => {
      toggle = result.current.toggle();
    });
    await waitFor(() => expect(loadModelSettings).toHaveBeenCalledOnce());
    const staleSignal = vi.mocked(loadModelSettings).mock.calls[0][3];

    rerender({ model: "model-b" });
    expect(result.current.enabled).toBe(false);
    expect(result.current.activePolicies).toEqual([]);
    expect(result.current.error).toBe("");
    expect(result.current.deploymentPolicy).toBeNull();
    expect(staleSignal?.aborted).toBe(true);

    await act(async () => {
      staleSettings.resolve(
        response(settings("model-a", ["Policy A", "Policy B"])),
      );
      staleDeployment.resolve(response(deploymentPolicy("model-a")));
      await toggle;
    });
    expect(result.current.enabled).toBe(false);
    expect(result.current.activePolicies).toEqual([]);
    expect(result.current.deploymentPolicy).toBeNull();
  });

  it("preserves the deployment-default sentinel and nullable assignment", async () => {
    vi.mocked(loadModelSettings).mockResolvedValue(
      response(settings("model-a", ["deployment_default", "Custom Policy"])),
    );
    vi.mocked(loadDeploymentGuardrailPolicy).mockResolvedValue(
      response(deploymentPolicy("model-a", null)),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.enabled).toBe(true);
    expect(result.current.activePolicies).toEqual([
      "deployment_default",
      "Custom Policy",
    ]);
    expect(result.current.deploymentPolicy).toEqual(
      deploymentPolicy("model-a", null),
    );
  });
});
