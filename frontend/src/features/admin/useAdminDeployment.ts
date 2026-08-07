import { useCallback, useEffect, useRef, useState } from "react";

import { createAdminDeployment, loadAdminConfig } from "@/api/admin";
import type {
  AdminConfig,
  AdminDeploymentDraft,
  FetchClient,
  ModelModality,
} from "@/api/types";
import { defaultDeploymentDraft } from "@/app/workspace/constants";
import type { StatusMessage } from "@/app/workspace/contracts";

type AdminDeploymentOptions = {
  fetchClient: FetchClient;
  onDeploymentCreated: (model: string, modalities: ModelModality[]) => void;
};

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function useAdminDeployment({
  fetchClient,
  onDeploymentCreated,
}: AdminDeploymentOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [deploymentDraft, setDeploymentDraft] = useState<AdminDeploymentDraft>(
    defaultDeploymentDraft,
  );
  const [isDeploying, setIsDeploying] = useState(false);
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const openRef = useRef(false);
  const mountedRef = useRef(true);
  const deploymentDraftRef = useRef(deploymentDraft);
  const loadControllerRef = useRef<AbortController | null>(null);
  const loadGenerationRef = useRef(0);
  const createControllerRef = useRef<AbortController | null>(null);
  const createGenerationRef = useRef(0);
  deploymentDraftRef.current = deploymentDraft;

  const cancelLoad = useCallback(() => {
    loadGenerationRef.current += 1;
    loadControllerRef.current?.abort();
    loadControllerRef.current = null;
  }, []);

  const cancelCreate = useCallback(() => {
    createGenerationRef.current += 1;
    createControllerRef.current?.abort();
    createControllerRef.current = null;
  }, []);

  const isCurrent = useCallback(
    (generation: number, controller: AbortController, current: number) =>
      mountedRef.current &&
      openRef.current &&
      generation === current &&
      !controller.signal.aborted,
    [],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      openRef.current = false;
      cancelLoad();
      cancelCreate();
    };
  }, [cancelCreate, cancelLoad]);

  const open = useCallback(async () => {
    cancelLoad();
    cancelCreate();
    const controller = new AbortController();
    loadControllerRef.current = controller;
    const generation = loadGenerationRef.current;
    openRef.current = true;
    setIsOpen(true);
    setIsDeploying(false);
    setMessage(null);

    try {
      const { response, data } = await loadAdminConfig(
        fetchClient,
        controller.signal,
      );
      if (!isCurrent(generation, controller, loadGenerationRef.current)) {
        return;
      }
      if (!response.ok) {
        setConfig(null);
        setMessage({
          type: "error",
          text: data.detail ?? "Failed to load deployment configuration.",
        });
        return;
      }
      setConfig(data as AdminConfig);
    } catch (error) {
      if (
        isCurrent(generation, controller, loadGenerationRef.current) &&
        !isAbortError(error)
      ) {
        setConfig(null);
        setMessage({
          type: "error",
          text: "Failed to load deployment configuration.",
        });
      }
    } finally {
      if (generation === loadGenerationRef.current) {
        loadControllerRef.current = null;
      }
    }
  }, [cancelCreate, cancelLoad, fetchClient, isCurrent]);

  const close = useCallback(() => {
    openRef.current = false;
    cancelLoad();
    cancelCreate();
    setIsOpen(false);
    setIsDeploying(false);
  }, [cancelCreate, cancelLoad]);

  const updateDeploymentDraft = useCallback(
    (patch: Partial<AdminDeploymentDraft>) => {
      setDeploymentDraft((current) => ({ ...current, ...patch }));
    },
    [],
  );

  const createDeployment = useCallback(async () => {
    if (!openRef.current) {
      return;
    }
    cancelCreate();
    const controller = new AbortController();
    createControllerRef.current = controller;
    const generation = createGenerationRef.current;
    const draft = deploymentDraftRef.current;
    setIsDeploying(true);
    setMessage(null);

    try {
      const { response, data } = await createAdminDeployment(
        fetchClient,
        draft,
        controller.signal,
      );
      if (!isCurrent(generation, controller, createGenerationRef.current)) {
        return;
      }
      if (!response.ok) {
        setMessage({
          type: "error",
          text: data.detail ?? "Failed to create deployment.",
        });
        return;
      }

      const deploymentName = data.settings.model;
      onDeploymentCreated(deploymentName, data.settings.modalities);
      if (!isCurrent(generation, controller, createGenerationRef.current)) {
        return;
      }
      setDeploymentDraft(defaultDeploymentDraft);
      setMessage({
        type: "success",
        text:
          data.deployment.status === "completed"
            ? `Created deployment ${deploymentName}.`
            : `Started deployment ${deploymentName}. It can take a few minutes before Foundry serves it.`,
      });
    } catch (error) {
      if (
        isCurrent(generation, controller, createGenerationRef.current) &&
        !isAbortError(error)
      ) {
        setMessage({
          type: "error",
          text: "Failed to create deployment.",
        });
      }
    } finally {
      if (isCurrent(generation, controller, createGenerationRef.current)) {
        setIsDeploying(false);
        createControllerRef.current = null;
      }
    }
  }, [cancelCreate, fetchClient, isCurrent, onDeploymentCreated]);

  return {
    isOpen,
    config,
    deploymentDraft,
    isDeploying,
    message,
    open,
    close,
    setDeploymentDraft,
    updateDeploymentDraft,
    createDeployment,
  };
}
