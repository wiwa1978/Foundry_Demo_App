import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AdminConfig,
  AdminDeploymentDraft,
  FetchClient,
} from "@/api/types";
import { defaultDeploymentDraft } from "@/app/workspace/constants";

import { useAdminDeployment } from "./useAdminDeployment";

const configuredTarget: AdminConfig = {
  is_configured: true,
  subscription_id: "subscription-id",
  resource_group: "foundry-rg",
  account_name: "foundry-account",
  missing: [],
};
const deploymentDraft: AdminDeploymentDraft = {
  deployment_name: "gpt-5.5-chat",
  model_name: "gpt-5.5",
  model_version: "2026-07-01",
  model_format: "OpenAI",
  sku_name: "GlobalStandard",
  sku_capacity: 10,
  version_upgrade_option: "OnceCurrentVersionExpired",
  rai_policy_name: "Strict",
  wait_for_completion: true,
  api_surface: "responses",
  modalities: ["text", "voice"],
};

const fetchClient = vi.fn<FetchClient>();
const onDeploymentCreated = vi.fn();

function jsonResponse(payload: unknown, status = 200) {
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

function setup() {
  return renderHook(() =>
    useAdminDeployment({ fetchClient, onDeploymentCreated }),
  );
}

async function openConfigured(result: ReturnType<typeof setup>["result"]) {
  fetchClient.mockResolvedValueOnce(jsonResponse(configuredTarget));
  await act(async () => result.current.open());
}

describe("useAdminDeployment", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("opens and loads the admin config with the established API trace", async () => {
    fetchClient.mockResolvedValueOnce(jsonResponse(configuredTarget));
    const { result } = setup();

    await act(async () => result.current.open());

    expect(result.current.isOpen).toBe(true);
    expect(result.current.config).toEqual(configuredTarget);
    expect(result.current.message).toBeNull();
    expect(fetchClient).toHaveBeenCalledWith(
      "/api/admin/deployments/config",
      { signal: expect.any(AbortSignal) },
      { label: "Load deployment admin config", responseKind: "json" },
    );
  });

  it("reports the existing fallback when config loading fails", async () => {
    fetchClient.mockResolvedValueOnce(jsonResponse({}, 500));
    const { result } = setup();

    await act(async () => result.current.open());

    expect(result.current.isOpen).toBe(true);
    expect(result.current.config).toBeNull();
    expect(result.current.message).toEqual({
      type: "error",
      text: "Failed to load deployment configuration.",
    });
  });

  it("fails closed and propagates a 403 detail", async () => {
    fetchClient
      .mockResolvedValueOnce(jsonResponse(configuredTarget))
      .mockResolvedValueOnce(
        jsonResponse({ detail: "Admin role required." }, 403),
      );
    const { result } = setup();

    await act(async () => result.current.open());
    expect(result.current.config).toEqual(configuredTarget);

    await act(async () => result.current.open());

    expect(result.current.config).toBeNull();
    expect(result.current.message).toEqual({
      type: "error",
      text: "Admin role required.",
    });
  });

  it("creates a deployment, invokes the callback, and resets the draft", async () => {
    const { result } = setup();
    await openConfigured(result);
    act(() => result.current.setDeploymentDraft(deploymentDraft));
    fetchClient.mockResolvedValueOnce(
      jsonResponse({
        settings: {
          model: deploymentDraft.deployment_name,
          modalities: deploymentDraft.modalities,
        },
        deployment: { status: "completed" },
      }),
    );

    await act(async () => result.current.createDeployment());

    expect(fetchClient).toHaveBeenLastCalledWith(
      "/api/admin/deployments",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deploymentDraft),
        signal: expect.any(AbortSignal),
      },
      {
        label: "Create Foundry deployment",
        request: deploymentDraft,
        responseKind: "json",
      },
    );
    expect(onDeploymentCreated).toHaveBeenCalledWith("gpt-5.5-chat", [
      "text",
      "voice",
    ]);
    expect(result.current.deploymentDraft).toEqual(defaultDeploymentDraft);
    expect(result.current.message).toEqual({
      type: "success",
      text: "Created deployment gpt-5.5-chat.",
    });
    expect(result.current.isDeploying).toBe(false);
  });

  it("preserves the started and failed deployment messages", async () => {
    const { result } = setup();
    await openConfigured(result);
    act(() => result.current.updateDeploymentDraft(deploymentDraft));
    fetchClient
      .mockResolvedValueOnce(
        jsonResponse({
          settings: {
            model: deploymentDraft.deployment_name,
            modalities: deploymentDraft.modalities,
          },
          deployment: { status: "provisioning" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ detail: "Deployment quota exceeded." }, 403),
      );

    await act(async () => result.current.createDeployment());
    expect(result.current.message).toEqual({
      type: "success",
      text: "Started deployment gpt-5.5-chat. It can take a few minutes before Foundry serves it.",
    });

    act(() => result.current.setDeploymentDraft(deploymentDraft));
    await act(async () => result.current.createDeployment());
    expect(result.current.message).toEqual({
      type: "error",
      text: "Deployment quota exceeded.",
    });
    expect(result.current.deploymentDraft).toEqual(deploymentDraft);
    expect(result.current.isDeploying).toBe(false);
    expect(onDeploymentCreated).toHaveBeenCalledOnce();
  });

  it("aborts and ignores a pending config load when closed", async () => {
    const pendingConfig = deferred<Response>();
    fetchClient.mockReturnValueOnce(pendingConfig.promise);
    const { result } = setup();
    let openPromise = Promise.resolve();

    act(() => {
      openPromise = result.current.open();
    });
    await waitFor(() => expect(fetchClient).toHaveBeenCalledOnce());
    const signal = fetchClient.mock.calls[0][1]?.signal;

    act(() => result.current.close());
    expect(signal?.aborted).toBe(true);
    expect(result.current.isOpen).toBe(false);

    await act(async () => {
      pendingConfig.resolve(jsonResponse(configuredTarget));
      await openPromise;
    });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.config).toBeNull();
    expect(result.current.message).toBeNull();
  });

  it("aborts and ignores a pending create when unmounted", async () => {
    const { result, unmount } = setup();
    await openConfigured(result);
    act(() => result.current.setDeploymentDraft(deploymentDraft));
    const pendingCreate = deferred<Response>();
    fetchClient.mockReturnValueOnce(pendingCreate.promise);
    let createPromise = Promise.resolve();

    act(() => {
      createPromise = result.current.createDeployment();
    });
    await waitFor(() => expect(fetchClient).toHaveBeenCalledTimes(2));
    const signal = fetchClient.mock.calls[1][1]?.signal;

    unmount();
    expect(signal?.aborted).toBe(true);
    pendingCreate.resolve(
      jsonResponse({
        settings: { model: "stale-model", modalities: ["text"] },
        deployment: { status: "completed" },
      }),
    );
    await createPromise;
    expect(onDeploymentCreated).not.toHaveBeenCalled();
  });
});
