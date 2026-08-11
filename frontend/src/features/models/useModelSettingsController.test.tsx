import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSelectableGuardrailPolicyCopies,
  listGuardrailPolicies,
  loadDeploymentGuardrailPolicy,
} from "@/api/guardrails";
import { loadModelSettings, saveModelSettings } from "@/api/modelSettings";
import type {
  DeploymentGuardrailPolicy,
  FetchClient,
  GuardrailPolicy,
  ModelSettings,
} from "@/api/types";

import { useModelSettingsController } from "./useModelSettingsController";

vi.mock("@/api/guardrails", () => ({
  createSelectableGuardrailPolicyCopies: vi.fn(),
  listGuardrailPolicies: vi.fn(),
  loadDeploymentGuardrailPolicy: vi.fn(),
}));
vi.mock("@/api/modelSettings", () => ({
  loadModelSettings: vi.fn(),
  saveModelSettings: vi.fn(),
}));

const fetchClient = vi.fn<FetchClient>();
const upsertModel = vi.fn();
const onOpen = vi.fn();

function settings(
  model: string,
  overrides: Partial<ModelSettings> = {},
): ModelSettings {
  return {
    model,
    api_surface: "responses",
    modalities: ["text"],
    system_prompt: "Be concise.",
    temperature: 0.7,
    top_p: 1,
    max_tokens: 1024,
    repetition_penalty: 1,
    guardrail_policy_names: ["deployment_default", "Strict"],
    ...overrides,
  };
}

function policy(name: string): GuardrailPolicy {
  return {
    name,
    type: "custom",
    mode: "blocking",
    content_filters: [],
    is_selectable: true,
  };
}

function deploymentPolicy(model: string): DeploymentGuardrailPolicy {
  return { deployment_name: model, policy_name: "Microsoft.DefaultV2" };
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
    ({ model }) =>
      useModelSettingsController({
        fetchClient,
        activeModel: model,
        upsertModel,
        onOpen,
      }),
    { initialProps: { model: activeModel } },
  );
}

describe("useModelSettingsController", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("ignores settings actions until a model and draft are available", async () => {
    const { result } = setup("");

    await act(async () => {
      await result.current.open();
      await result.current.save();
    });
    act(() => {
      result.current.changeDraft({ temperature: 0.1 });
      result.current.resetDraft();
    });

    expect(onOpen).not.toHaveBeenCalled();
    expect(loadModelSettings).not.toHaveBeenCalled();
    expect(result.current.draft).toBeNull();
  });

  it("aborts model A and ignores its stale response after model B opens", async () => {
    const staleSettings = deferred<Response>();
    vi.mocked(loadModelSettings).mockImplementation((_client, model) =>
      model === "model-a"
        ? staleSettings.promise
        : Promise.resolve(response(settings(model))),
    );
    vi.mocked(listGuardrailPolicies).mockResolvedValue(
      response({ policies: [policy("Strict")] }),
    );
    vi.mocked(loadDeploymentGuardrailPolicy).mockImplementation(
      (_client, model) => Promise.resolve(response(deploymentPolicy(model))),
    );
    const { result } = setup();

    let staleOpen: Promise<void> = Promise.resolve();
    act(() => {
      staleOpen = result.current.open("model-a");
    });
    await waitFor(() => expect(loadModelSettings).toHaveBeenCalledOnce());
    const staleSignal = vi.mocked(loadModelSettings).mock.calls[0][3];

    await act(async () => {
      await result.current.open("model-b");
    });
    expect(staleSignal?.aborted).toBe(true);
    expect(result.current.settingsModel).toBe("model-b");
    expect(result.current.draft).toEqual(settings("model-b"));

    await act(async () => {
      staleSettings.resolve(response(settings("model-a")));
      await staleOpen;
    });
    expect(result.current.settingsModel).toBe("model-b");
    expect(result.current.draft).toEqual(settings("model-b"));
    expect(result.current.policiesLoading).toBe(false);
  });

  it("loads and saves settings with existing API labels and immediate upsert", async () => {
    vi.mocked(loadModelSettings).mockResolvedValue(
      response(settings("model-a")),
    );
    vi.mocked(listGuardrailPolicies).mockResolvedValue(
      response({ policies: [policy("Strict")] }),
    );
    vi.mocked(loadDeploymentGuardrailPolicy).mockResolvedValue(
      response(deploymentPolicy("model-a")),
    );
    vi.mocked(saveModelSettings).mockResolvedValue(
      response(settings("model-a", { temperature: 0.2 })),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.open();
    });
    expect(onOpen).toHaveBeenCalledOnce();
    expect(result.current.policies).toEqual([policy("Strict")]);
    expect(result.current.deploymentPolicy).toEqual(
      deploymentPolicy("model-a"),
    );
    expect(loadModelSettings).toHaveBeenCalledWith(
      fetchClient,
      "model-a",
      "Load model settings",
      expect.any(AbortSignal),
    );

    act(() => result.current.changeDraft({ temperature: 0.2 }));
    await act(async () => {
      await result.current.save();
    });
    expect(saveModelSettings).toHaveBeenCalledWith(
      fetchClient,
      settings("model-a", { temperature: 0.2 }),
      "Save model settings",
      expect.any(AbortSignal),
    );
    expect(upsertModel).toHaveBeenCalledWith("model-a", ["text"]);
    expect(result.current.draft?.temperature).toBe(0.2);
    expect(result.current.saving).toBe(false);
  });

  it("creates selectable policy copies and refreshes the policy catalog", async () => {
    vi.mocked(createSelectableGuardrailPolicyCopies).mockResolvedValue(
      response({ policies: [policy("FoundryChat-Microsoft-Default")] }),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.createPolicyCopies();
    });

    expect(createSelectableGuardrailPolicyCopies).toHaveBeenCalledWith(
      fetchClient,
      expect.any(AbortSignal),
    );
    expect(result.current.policies).toEqual([
      policy("FoundryChat-Microsoft-Default"),
    ]);
    expect(result.current.creatingPolicyCopies).toBe(false);
  });

  it("surfaces failed loads and saves without updating the catalog", async () => {
    vi.mocked(loadModelSettings)
      .mockResolvedValueOnce(response({ detail: "load denied" }, 403))
      .mockResolvedValueOnce(response(settings("model-a")));
    vi.mocked(listGuardrailPolicies).mockImplementation(() =>
      Promise.resolve(response({ policies: [] })),
    );
    vi.mocked(loadDeploymentGuardrailPolicy).mockImplementation(() =>
      Promise.resolve(response(deploymentPolicy("model-a"))),
    );
    vi.mocked(saveModelSettings).mockResolvedValue(
      response({ detail: "save denied" }, 403),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.open("model-a");
    });
    expect(result.current.draft).toBeNull();
    expect(result.current.error).toBe("load denied");

    await act(async () => {
      await result.current.open("model-a");
    });
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.error).toBe("save denied");
    expect(result.current.saving).toBe(false);
    expect(upsertModel).not.toHaveBeenCalled();
  });

  it("keeps loaded settings while reporting guardrail metadata failures", async () => {
    vi.mocked(loadModelSettings).mockResolvedValue(
      response(settings("model-a")),
    );
    vi.mocked(listGuardrailPolicies).mockResolvedValue(response({}, 502));
    vi.mocked(loadDeploymentGuardrailPolicy).mockResolvedValue(
      response({}, 502),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.open("model-a");
    });

    expect(result.current.draft).toEqual(settings("model-a"));
    expect(result.current.policies).toEqual([]);
    expect(result.current.deploymentPolicy).toBeNull();
    expect(result.current.error).toBe(
      "Failed to retrieve the deployment guardrail.",
    );
  });

  it("saves model capabilities with the established payload and upserts them", async () => {
    vi.mocked(loadModelSettings).mockResolvedValue(
      response(settings("image-model")),
    );
    vi.mocked(saveModelSettings).mockResolvedValue(
      response(settings("image-model", { modalities: ["image", "voice"] })),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.saveModelCapabilities("image-model", [
        "image",
        "voice",
      ]);
    });

    expect(loadModelSettings).toHaveBeenCalledWith(
      fetchClient,
      "image-model",
      "Load model capabilities",
    );
    expect(saveModelSettings).toHaveBeenCalledWith(
      fetchClient,
      settings("image-model", { modalities: ["image", "voice"] }),
      "Save model capabilities",
    );
    expect(upsertModel).toHaveBeenCalledWith("image-model", ["image", "voice"]);
  });

  it("rejects failed capability loads and saves", async () => {
    vi.mocked(loadModelSettings)
      .mockResolvedValueOnce(response({}, 500))
      .mockResolvedValueOnce(response(settings("model-a")));
    vi.mocked(saveModelSettings).mockResolvedValue(response({}, 500));
    const { result } = setup();

    await expect(
      result.current.saveModelCapabilities("model-a", ["image"]),
    ).rejects.toThrow("Failed to load model capabilities.");
    await expect(
      result.current.saveModelCapabilities("model-a", ["image"]),
    ).rejects.toThrow("Failed to save model capabilities.");
    expect(upsertModel).not.toHaveBeenCalled();
  });
});
