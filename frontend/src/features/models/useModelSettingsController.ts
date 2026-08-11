import { useCallback, useEffect, useRef, useState } from "react";

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
  ModelModality,
  ModelSettings,
} from "@/api/types";
import { defaultSettings } from "@/app/workspace/constants";

type ErrorResponse = { detail?: string };
type PoliciesResponse = ErrorResponse & { policies?: GuardrailPolicy[] };

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function useModelSettingsController({
  fetchClient,
  activeModel,
  upsertModel,
  onOpen,
}: {
  fetchClient: FetchClient;
  activeModel: string;
  upsertModel: (model: string, modalities: ModelModality[]) => void;
  onOpen: () => void;
}) {
  const [settingsModel, setSettingsModel] = useState<string | null>(null);
  const [draft, setDraft] = useState<ModelSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [policies, setPolicies] = useState<GuardrailPolicy[]>([]);
  const [deploymentPolicy, setDeploymentPolicy] =
    useState<DeploymentGuardrailPolicy | null>(null);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [creatingPolicyCopies, setCreatingPolicyCopies] = useState(false);
  const [error, setError] = useState("");
  const loadControllerRef = useRef<AbortController | null>(null);
  const loadGenerationRef = useRef(0);
  const saveControllerRef = useRef<AbortController | null>(null);
  const saveGenerationRef = useRef(0);
  const policyCopyControllerRef = useRef<AbortController | null>(null);
  const policyCopyGenerationRef = useRef(0);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const cancelLoad = useCallback(() => {
    loadGenerationRef.current += 1;
    loadControllerRef.current?.abort();
    loadControllerRef.current = null;
  }, []);

  const cancelSave = useCallback(() => {
    saveGenerationRef.current += 1;
    saveControllerRef.current?.abort();
    saveControllerRef.current = null;
  }, []);

  const cancelPolicyCopy = useCallback(() => {
    policyCopyGenerationRef.current += 1;
    policyCopyControllerRef.current?.abort();
    policyCopyControllerRef.current = null;
  }, []);

  useEffect(
    () => () => {
      cancelLoad();
      cancelSave();
      cancelPolicyCopy();
    },
    [cancelLoad, cancelPolicyCopy, cancelSave],
  );

  const open = useCallback(
    async (model = activeModel) => {
      if (!model) {
        return;
      }

      cancelLoad();
      cancelSave();
      cancelPolicyCopy();
      const controller = new AbortController();
      loadControllerRef.current = controller;
      const generation = loadGenerationRef.current;
      setSettingsModel(model);
      onOpen();
      setDraft(null);
      setError("");
      setPoliciesLoading(true);
      setDeploymentPolicy(null);
      setSaving(false);
      setCreatingPolicyCopies(false);

      try {
        const [settingsResponse, policiesResponse, deploymentPolicyResponse] =
          await Promise.all([
            loadModelSettings(
              fetchClient,
              model,
              "Load model settings",
              controller.signal,
            ),
            listGuardrailPolicies(fetchClient, controller.signal),
            loadDeploymentGuardrailPolicy(
              fetchClient,
              model,
              controller.signal,
            ),
          ]);
        if (
          generation !== loadGenerationRef.current ||
          controller.signal.aborted
        ) {
          return;
        }
        const [settingsData, policiesData, deploymentPolicyData] =
          await Promise.all([
            settingsResponse.json() as Promise<ModelSettings & ErrorResponse>,
            policiesResponse.json() as Promise<PoliciesResponse>,
            deploymentPolicyResponse.json() as Promise<
              DeploymentGuardrailPolicy & ErrorResponse
            >,
          ]);
        if (
          generation !== loadGenerationRef.current ||
          controller.signal.aborted
        ) {
          return;
        }
        if (!settingsResponse.ok) {
          throw new Error(
            settingsData.detail ?? "Failed to load model settings.",
          );
        }
        setDraft(settingsData);
        if (!policiesResponse.ok) {
          setPolicies([]);
          setError(
            policiesData.detail ?? "Failed to retrieve Foundry guardrails.",
          );
        } else {
          setPolicies(policiesData.policies ?? []);
        }
        if (!deploymentPolicyResponse.ok) {
          setError(
            deploymentPolicyData.detail ??
              "Failed to retrieve the deployment guardrail.",
          );
        } else {
          setDeploymentPolicy(deploymentPolicyData);
        }
      } catch (loadError) {
        if (
          generation === loadGenerationRef.current &&
          !controller.signal.aborted &&
          !isAbortError(loadError)
        ) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load settings.",
          );
        }
      } finally {
        if (generation === loadGenerationRef.current) {
          setPoliciesLoading(false);
          loadControllerRef.current = null;
        }
      }
    },
    [
      activeModel,
      cancelLoad,
      cancelPolicyCopy,
      cancelSave,
      fetchClient,
      onOpen,
    ],
  );

  const close = useCallback(() => {
    cancelLoad();
    cancelSave();
    cancelPolicyCopy();
    setSettingsModel(null);
    setPoliciesLoading(false);
    setSaving(false);
    setCreatingPolicyCopies(false);
  }, [cancelLoad, cancelPolicyCopy, cancelSave]);

  const changeDraft = useCallback((patch: Partial<ModelSettings>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const resetDraft = useCallback(() => {
    setDraft((current) =>
      current ? { model: current.model, ...defaultSettings } : current,
    );
  }, []);

  const save = useCallback(async () => {
    const settings = draftRef.current;
    if (!settings) {
      return;
    }

    cancelSave();
    const controller = new AbortController();
    saveControllerRef.current = controller;
    const generation = saveGenerationRef.current;
    setSaving(true);
    setError("");
    try {
      const response = await saveModelSettings(
        fetchClient,
        settings,
        "Save model settings",
        controller.signal,
      );
      const saved = (await response.json()) as ModelSettings & ErrorResponse;
      if (
        generation !== saveGenerationRef.current ||
        controller.signal.aborted
      ) {
        return;
      }
      if (!response.ok) {
        throw new Error(saved.detail ?? "Failed to save settings.");
      }
      setDraft(saved);
      upsertModel(saved.model, saved.modalities);
    } catch (saveError) {
      if (
        generation === saveGenerationRef.current &&
        !controller.signal.aborted &&
        !isAbortError(saveError)
      ) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Failed to save settings.",
        );
      }
    } finally {
      if (generation === saveGenerationRef.current) {
        setSaving(false);
        saveControllerRef.current = null;
      }
    }
  }, [cancelSave, fetchClient, upsertModel]);

  const createPolicyCopies = useCallback(async () => {
    cancelPolicyCopy();
    const controller = new AbortController();
    policyCopyControllerRef.current = controller;
    const generation = policyCopyGenerationRef.current;
    setCreatingPolicyCopies(true);
    setError("");
    try {
      const response = await createSelectableGuardrailPolicyCopies(
        fetchClient,
        controller.signal,
      );
      const data = (await response.json()) as PoliciesResponse;
      if (
        generation !== policyCopyGenerationRef.current ||
        controller.signal.aborted
      ) {
        return;
      }
      if (!response.ok) {
        throw new Error(
          data.detail ?? "Failed to create selectable guardrail copies.",
        );
      }
      setPolicies(data.policies ?? []);
    } catch (copyError) {
      if (
        generation === policyCopyGenerationRef.current &&
        !controller.signal.aborted &&
        !isAbortError(copyError)
      ) {
        setError(
          copyError instanceof Error
            ? copyError.message
            : "Failed to create selectable guardrail copies.",
        );
      }
    } finally {
      if (generation === policyCopyGenerationRef.current) {
        setCreatingPolicyCopies(false);
        policyCopyControllerRef.current = null;
      }
    }
  }, [cancelPolicyCopy, fetchClient]);

  const saveModelCapabilities = useCallback(
    async (model: string, modalities: ModelModality[]) => {
      const settingsResponse = await loadModelSettings(
        fetchClient,
        model,
        "Load model capabilities",
      );
      const settings = (await settingsResponse.json()) as ModelSettings &
        ErrorResponse;
      if (!settingsResponse.ok) {
        throw new Error(
          settings.detail ?? "Failed to load model capabilities.",
        );
      }
      const request = { ...settings, modalities };
      const response = await saveModelSettings(
        fetchClient,
        request,
        "Save model capabilities",
      );
      const saved = (await response.json()) as ModelSettings & ErrorResponse;
      if (!response.ok) {
        throw new Error(saved.detail ?? "Failed to save model capabilities.");
      }
      upsertModel(model, saved.modalities);
    },
    [fetchClient, upsertModel],
  );

  return {
    settingsModel,
    draft,
    saving,
    policies,
    deploymentPolicy,
    policiesLoading,
    creatingPolicyCopies,
    error,
    open,
    close,
    save,
    createPolicyCopies,
    saveModelCapabilities,
    changeDraft,
    resetDraft,
  };
}
