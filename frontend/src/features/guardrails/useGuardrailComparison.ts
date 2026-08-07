import { useCallback, useEffect, useRef, useState } from "react";

import { loadDeploymentGuardrailPolicy } from "@/api/guardrails";
import { loadModelSettings } from "@/api/modelSettings";
import type {
  DeploymentGuardrailPolicy,
  FetchClient,
  ModelSettings,
} from "@/api/types";

type ErrorResponse = { detail?: string };

type ComparisonState = {
  model: string;
  enabled: boolean;
  activePolicies: string[];
  error: string;
  deploymentPolicy: DeploymentGuardrailPolicy | null;
};

function emptyState(model: string): ComparisonState {
  return {
    model,
    enabled: false,
    activePolicies: [],
    error: "",
    deploymentPolicy: null,
  };
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function useGuardrailComparison({
  fetchClient,
  activeModel,
}: {
  fetchClient: FetchClient;
  activeModel: string;
}) {
  const [state, setState] = useState(() => emptyState(activeModel));
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const activeModelRef = useRef(activeModel);
  activeModelRef.current = activeModel;
  const currentState =
    state.model === activeModel ? state : emptyState(activeModel);

  const cancelRequest = useCallback(() => {
    generationRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const reset = useCallback(() => {
    cancelRequest();
    setState(emptyState(activeModel));
  }, [activeModel, cancelRequest]);

  useEffect(() => {
    reset();
    return cancelRequest;
  }, [cancelRequest, reset]);

  const toggle = useCallback(async () => {
    if (currentState.enabled) {
      cancelRequest();
      setState((current) =>
        current.model === activeModel
          ? { ...current, enabled: false, error: "" }
          : emptyState(activeModel),
      );
      return;
    }

    cancelRequest();
    const controller = new AbortController();
    controllerRef.current = controller;
    const generation = generationRef.current;
    const model = activeModel;
    setState((current) =>
      current.model === model ? { ...current, error: "" } : emptyState(model),
    );
    try {
      const [response, deploymentPolicyResponse] = await Promise.all([
        loadModelSettings(
          fetchClient,
          model,
          "Load guardrail comparison settings",
          controller.signal,
        ),
        loadDeploymentGuardrailPolicy(fetchClient, model, controller.signal),
      ]);
      if (
        generation !== generationRef.current ||
        controller.signal.aborted ||
        model !== activeModelRef.current
      ) {
        return;
      }
      const [settings, deploymentPolicy] = await Promise.all([
        response.json() as Promise<ModelSettings & ErrorResponse>,
        deploymentPolicyResponse.json() as Promise<
          DeploymentGuardrailPolicy & ErrorResponse
        >,
      ]);
      if (
        generation !== generationRef.current ||
        controller.signal.aborted ||
        model !== activeModelRef.current
      ) {
        return;
      }
      if (!response.ok) {
        throw new Error(
          settings.detail ?? "Failed to load guardrail settings.",
        );
      }
      if (!deploymentPolicyResponse.ok) {
        throw new Error(
          deploymentPolicy.detail ?? "Failed to load the deployment guardrail.",
        );
      }
      if (settings.guardrail_policy_names.length !== 2) {
        throw new Error(
          "Configure two guardrails in model settings before enabling this test.",
        );
      }
      setState({
        model,
        enabled: true,
        activePolicies: settings.guardrail_policy_names,
        error: "",
        deploymentPolicy,
      });
    } catch (comparisonError) {
      if (
        generation === generationRef.current &&
        !controller.signal.aborted &&
        model === activeModelRef.current &&
        !isAbortError(comparisonError)
      ) {
        setState((current) => ({
          ...(current.model === model ? current : emptyState(model)),
          enabled: false,
          error:
            comparisonError instanceof Error
              ? comparisonError.message
              : "Failed to enable guardrail comparison.",
        }));
      }
    } finally {
      if (generation === generationRef.current) {
        controllerRef.current = null;
      }
    }
  }, [activeModel, cancelRequest, currentState.enabled, fetchClient]);

  return {
    enabled: currentState.enabled,
    activePolicies: currentState.activePolicies,
    error: currentState.error,
    deploymentPolicy: currentState.deploymentPolicy,
    toggle,
    reset,
  };
}
