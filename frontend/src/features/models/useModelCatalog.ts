import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";

import { discoverModels, registerModel } from "@/api/models";
import type {
  ConfigResponse,
  FetchClient,
  ModelModality,
  ModelsResponse,
} from "@/api/types";
import type { UseCaseWorkspace } from "@/app/types";
import {
  defaultComparisonModelCount,
  isImageModelName,
  isRealtimeOnlyTranscriptionModel,
  isRecordedAudioTranscriptionModel,
  maxComparisonModelCount,
  openAiTranscriptionModels,
} from "@/app/workspace/constants";
import type { StatusMessage } from "@/app/workspace/contracts";

const discoveryIntervalMs = 5 * 60_000;

type DesiredModelKind = "text" | "image";

type CatalogUpdate = {
  models?: string[];
  textModels?: string[];
  transcriptionModels?: string[];
  realtimeTranscriptionModels?: string[];
  traditionalTranscriptionModels?: string[];
  ttsModels?: string[];
  modelModalities?: Record<string, ModelModality[]>;
};

type CatalogState = {
  models: string[];
  pinnedModels: string[];
  discoveredModels: string[];
  modelModalities: Record<string, ModelModality[]>;
  textModels: string[];
  activeModel: string;
  selectedModels: Set<string>;
  transcriptionModels: string[];
  transcriptionModel: string;
  selectedTranscriptionModels: Set<string>;
  realtimeTranscriptionModels: string[];
  traditionalTranscriptionModels: string[];
  traditionalTranscriptionModel: string;
  ttsModels: string[];
  ttsModel: string;
};

const initialState: CatalogState = {
  models: [],
  pinnedModels: [],
  discoveredModels: [],
  modelModalities: {},
  textModels: [],
  activeModel: "",
  selectedModels: new Set(),
  transcriptionModels: [],
  transcriptionModel: "",
  selectedTranscriptionModels: new Set(),
  realtimeTranscriptionModels: [],
  traditionalTranscriptionModels: [],
  traditionalTranscriptionModel: "",
  ttsModels: [],
  ttsModel: "",
};

function uniqueModels(models: Array<string | null>) {
  return Array.from(
    new Set(models.filter((model): model is string => Boolean(model))),
  );
}

function isEmbeddingModel(model: string) {
  return model.trim().toLowerCase().includes("embedding");
}
function inferredModalities(model: string): ModelModality[] {
  return isImageModelName(model) ? ["image"] : ["text"];
}

function sameSelection(current: Set<string>, next: string[]) {
  return (
    current.size === next.length && next.every((model) => current.has(model))
  );
}

function desiredModelKind(workspace: UseCaseWorkspace): DesiredModelKind {
  if (
    workspace === "image" ||
    workspace === "imageEdit" ||
    workspace === "imageComparison"
  ) {
    return "image";
  }
  return "text";
}

function nonEmptyUpdate(current: string[], update: string[] | undefined) {
  return update?.length ? uniqueModels(update) : current;
}

function reconcileCatalog(
  current: CatalogState,
  update: CatalogUpdate,
  kind: DesiredModelKind,
  source: "bootstrap" | "discovery" | "upsert" | "selection",
): CatalogState {
  const pinnedModels =
    source === "bootstrap"
      ? uniqueModels([...current.pinnedModels, ...(update.models ?? [])])
      : source === "upsert"
        ? uniqueModels([...current.pinnedModels, ...(update.models ?? [])])
        : current.pinnedModels;
  const discoveredModels =
    source === "discovery" && update.models?.length
      ? uniqueModels(update.models)
      : current.discoveredModels;
  const models = uniqueModels([...discoveredModels, ...pinnedModels]);
  const modelModalities = Object.fromEntries(
    models.map((model) => [
      model,
      update.modelModalities?.[model] ??
        current.modelModalities[model] ??
        inferredModalities(model),
    ]),
  ) as Record<string, ModelModality[]>;
  const transcriptionModels = nonEmptyUpdate(
    current.transcriptionModels,
    update.transcriptionModels,
  );
  const realtimeTranscriptionModels = nonEmptyUpdate(
    current.realtimeTranscriptionModels,
    update.realtimeTranscriptionModels,
  );
  const traditionalTranscriptionModels = nonEmptyUpdate(
    current.traditionalTranscriptionModels,
    update.traditionalTranscriptionModels,
  );
  const ttsModels = nonEmptyUpdate(current.ttsModels, update.ttsModels);
  const textModels =
    update.textModels !== undefined
      ? uniqueModels(update.textModels)
      : models.filter(
          (model) =>
            modelModalities[model]?.includes("text") &&
            !transcriptionModels.includes(model) &&
            !realtimeTranscriptionModels.includes(model) &&
            !isEmbeddingModel(model),
        );
  const imageModels = models.filter((model) =>
    modelModalities[model]?.includes("image"),
  );
  const compatibleModels = kind === "image" ? imageModels : textModels;
  const activeModel = compatibleModels.includes(current.activeModel)
    ? current.activeModel
    : (compatibleModels[0] ?? "");
  const retainedSelection = textModels
    .filter((model) => current.selectedModels.has(model))
    .slice(0, maxComparisonModelCount);
  const selectedModelList = (
    retainedSelection.length
      ? retainedSelection
      : textModels.slice(0, defaultComparisonModelCount)
  ).slice(0, maxComparisonModelCount);
  const selectedModels = sameSelection(
    current.selectedModels,
    selectedModelList,
  )
    ? current.selectedModels
    : new Set(selectedModelList);
  const retainedTranscriptionSelection = transcriptionModels
    .filter((model) => current.selectedTranscriptionModels.has(model))
    .slice(0, maxComparisonModelCount);
  const selectedTranscriptionModelList = (
    retainedTranscriptionSelection.length
      ? retainedTranscriptionSelection
      : transcriptionModels.slice(0, defaultComparisonModelCount)
  ).slice(0, maxComparisonModelCount);
  const selectedTranscriptionModels = sameSelection(
    current.selectedTranscriptionModels,
    selectedTranscriptionModelList,
  )
    ? current.selectedTranscriptionModels
    : new Set(selectedTranscriptionModelList);

  return {
    models,
    pinnedModels,
    discoveredModels,
    modelModalities,
    textModels,
    activeModel,
    selectedModels,
    transcriptionModels,
    transcriptionModel: transcriptionModels.includes(current.transcriptionModel)
      ? current.transcriptionModel
      : (transcriptionModels[0] ?? ""),
    selectedTranscriptionModels,
    realtimeTranscriptionModels,
    traditionalTranscriptionModels,
    traditionalTranscriptionModel: traditionalTranscriptionModels.includes(
      current.traditionalTranscriptionModel,
    )
      ? current.traditionalTranscriptionModel
      : (traditionalTranscriptionModels[0] ?? ""),
    ttsModels,
    ttsModel: ttsModels.includes(current.ttsModel)
      ? current.ttsModel
      : (ttsModels[0] ?? ""),
  };
}

function configUpdate(config: ConfigResponse): CatalogUpdate {
  const models = config.models;
  const configuredRealtimeTranscriptionModels = uniqueModels([
    config.realtime_transcription_model ?? null,
    ...(config.realtime_transcription_models ?? []),
  ]);
  return {
    models,
    transcriptionModels: uniqueModels([
      config.speech_transcription_model,
      config.transcription_model,
      ...openAiTranscriptionModels,
      ...models.filter(isRecordedAudioTranscriptionModel),
    ]),
    realtimeTranscriptionModels: uniqueModels([
      ...configuredRealtimeTranscriptionModels,
      ...models.filter(isRealtimeOnlyTranscriptionModel),
    ]),
    traditionalTranscriptionModels: uniqueModels([config.transcription_model]),
    ttsModels: uniqueModels([config.tts_model]),
    modelModalities: Object.fromEntries(
      models.map((model) => [model, inferredModalities(model)]),
    ),
  };
}

type ModelDiscoveryDeployment = {
  name: string;
  model_name?: string | null;
};

function discoveryUpdate(data: ModelsResponse): CatalogUpdate {
  const deployments = (
    data as ModelsResponse & { deployments?: ModelDiscoveryDeployment[] }
  ).deployments;
  const realtimeTranscriptionDeployments = (deployments ?? [])
    .filter((deployment) =>
      isRealtimeOnlyTranscriptionModel(
        deployment.model_name ?? deployment.name,
      ),
    )
    .map((deployment) => deployment.name);
  return {
    models: data.models,
    textModels: data.text_models,
    transcriptionModels: uniqueModels([
      ...(data.transcription_models ?? []).filter(
        (model) => !isRealtimeOnlyTranscriptionModel(model),
      ),
      ...openAiTranscriptionModels,
    ]),
    realtimeTranscriptionModels: uniqueModels([
      ...(data.realtime_transcription_models ?? []),
      ...realtimeTranscriptionDeployments,
      ...(data.transcription_models ?? []).filter(
        isRealtimeOnlyTranscriptionModel,
      ),
    ]),
    traditionalTranscriptionModels: data.traditional_transcription_models ?? [],
    ttsModels: data.tts_models ?? [],
    modelModalities:
      data.model_modalities ??
      Object.fromEntries(
        data.models.map((model) => [model, inferredModalities(model)]),
      ),
  };
}

export function useModelCatalog({
  fetchClient,
  config,
  canUseProtectedApis,
  workspace,
}: {
  fetchClient: FetchClient;
  config: ConfigResponse | null;
  canUseProtectedApis: boolean;
  workspace: UseCaseWorkspace;
}) {
  const [state, setState] = useState(initialState);
  const [ttsVoice, setTtsVoice] = useState("alloy");
  const [newModel, setNewModel] = useState("");
  const [modelEndpointMessage, setModelEndpointMessage] =
    useState<StatusMessage | null>(null);
  const kind = desiredModelKind(workspace);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!config) {
      return;
    }
    setState((current) =>
      reconcileCatalog(current, configUpdate(config), "text", "bootstrap"),
    );
    setTtsVoice(config.tts_voice ?? "alloy");
  }, [config]);

  useEffect(() => {
    setState((current) => reconcileCatalog(current, {}, kind, "selection"));
  }, [kind]);

  useEffect(() => {
    if (!config || !canUseProtectedApis) {
      return;
    }

    let controller: AbortController | null = null;
    let requestGeneration = 0;
    const refreshModels = () => {
      controller?.abort();
      controller = new AbortController();
      const requestController = controller;
      const generation = ++requestGeneration;
      discoverModels(fetchClient, requestController.signal)
        .then((data) => {
          if (
            requestController.signal.aborted ||
            generation !== requestGeneration
          ) {
            return;
          }
          setState((current) =>
            reconcileCatalog(current, discoveryUpdate(data), kind, "discovery"),
          );
          if (data.discovery_error) {
            console.warn(
              "Foundry deployment discovery unavailable:",
              data.discovery_error,
            );
          }
        })
        .catch((error: unknown) => {
          if (
            !requestController.signal.aborted &&
            generation === requestGeneration
          ) {
            console.warn(
              "Foundry deployment discovery failed:",
              error instanceof Error ? error.message : "Unknown error",
            );
          }
        });
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refreshModels();
      }
    };

    refreshModels();
    const refreshInterval = window.setInterval(
      refreshModels,
      discoveryIntervalMs,
    );
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      requestGeneration += 1;
      window.clearInterval(refreshInterval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      controller?.abort();
    };
  }, [canUseProtectedApis, config, fetchClient, kind]);

  const setActiveModel = useCallback<Dispatch<SetStateAction<string>>>(
    (nextModel) => {
      setState((current) => ({
        ...current,
        activeModel:
          typeof nextModel === "function"
            ? nextModel(current.activeModel)
            : nextModel,
      }));
    },
    [],
  );

  const setTranscriptionModel = useCallback<Dispatch<SetStateAction<string>>>(
    (nextModel) => {
      setState((current) => ({
        ...current,
        transcriptionModel:
          typeof nextModel === "function"
            ? nextModel(current.transcriptionModel)
            : nextModel,
      }));
    },
    [],
  );

  const setTraditionalTranscriptionModel = useCallback<
    Dispatch<SetStateAction<string>>
  >((nextModel) => {
    setState((current) => ({
      ...current,
      traditionalTranscriptionModel:
        typeof nextModel === "function"
          ? nextModel(current.traditionalTranscriptionModel)
          : nextModel,
    }));
  }, []);

  const setTtsModel = useCallback<Dispatch<SetStateAction<string>>>(
    (nextModel) => {
      setState((current) => ({
        ...current,
        ttsModel:
          typeof nextModel === "function"
            ? nextModel(current.ttsModel)
            : nextModel,
      }));
    },
    [],
  );

  const upsertModel = useCallback(
    (model: string, modalities: ModelModality[]) => {
      const normalizedModel = model.trim();
      if (!normalizedModel) {
        return;
      }
      setState((current) =>
        reconcileCatalog(
          current,
          {
            models: [normalizedModel],
            modelModalities: { [normalizedModel]: modalities },
          },
          kind,
          "upsert",
        ),
      );
    },
    [kind],
  );

  const activateModel = useCallback(
    (model: string) => {
      setState((current) => {
        const modalities = current.modelModalities[model];
        if (!modalities?.includes(kind === "image" ? "image" : "text")) {
          return current;
        }
        const selectedModels = new Set(current.selectedModels);
        if (
          modalities.includes("text") &&
          selectedModels.size < maxComparisonModelCount
        ) {
          selectedModels.add(model);
        }
        return { ...current, activeModel: model, selectedModels };
      });
    },
    [kind],
  );

  const addModel = useCallback(async () => {
    const model = newModel.trim();
    setModelEndpointMessage(null);
    if (!model) {
      return;
    }
    if (
      stateRef.current.models.some(
        (item) => item.toLowerCase() === model.toLowerCase(),
      )
    ) {
      setModelEndpointMessage({
        type: "error",
        text: `${model} is already in the model list.`,
      });
      return;
    }

    try {
      const { response, data } = await registerModel(fetchClient, model);
      if (!response.ok) {
        setModelEndpointMessage({
          type: "error",
          text: data.detail ?? "Failed to save model endpoint.",
        });
        return;
      }

      const deploymentName = data.settings.model;
      const modalities = data.settings.modalities;
      setState((current) => {
        const registered = reconcileCatalog(
          current,
          {
            models: uniqueModels([...(data.models ?? []), deploymentName]),
            modelModalities: { [deploymentName]: modalities },
          },
          kind,
          "upsert",
        );
        const selectedModels = new Set(registered.selectedModels);
        if (
          modalities.includes("text") &&
          selectedModels.size < maxComparisonModelCount
        ) {
          selectedModels.add(deploymentName);
        }
        return {
          ...registered,
          activeModel: modalities.includes(kind === "image" ? "image" : "text")
            ? deploymentName
            : registered.activeModel,
          selectedModels,
        };
      });
      setNewModel("");
      setModelEndpointMessage({
        type: "success",
        text: `Saved ${deploymentName} to the local model registry.`,
      });
    } catch (error) {
      setModelEndpointMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to save model endpoint.",
      });
    }
  }, [fetchClient, kind, newModel]);

  const toggleModel = useCallback((model: string) => {
    setState((current) => {
      const selectedModels = new Set(current.selectedModels);
      if (selectedModels.has(model)) {
        selectedModels.delete(model);
      } else if (selectedModels.size < maxComparisonModelCount) {
        selectedModels.add(model);
        if (selectedModels.size === maxComparisonModelCount) {
          toast.info("Comparison limit reached", {
            description: `You can compare up to ${maxComparisonModelCount} models at a time.`,
          });
        }
      }
      return { ...current, selectedModels };
    });
  }, []);

  const toggleTranscriptionModel = useCallback((model: string) => {
    setState((current) => {
      const selectedTranscriptionModels = new Set(
        current.selectedTranscriptionModels,
      );
      if (selectedTranscriptionModels.has(model)) {
        selectedTranscriptionModels.delete(model);
      } else if (selectedTranscriptionModels.size < maxComparisonModelCount) {
        selectedTranscriptionModels.add(model);
      }
      return { ...current, selectedTranscriptionModels };
    });
  }, []);

  const replaceComparisonModel = useCallback(
    (currentModel: string, nextModel: string) => {
      if (currentModel === nextModel) {
        return;
      }
      setState((current) => {
        const selectedModels = new Set(current.selectedModels);
        selectedModels.delete(currentModel);
        selectedModels.add(nextModel);
        return { ...current, selectedModels };
      });
    },
    [],
  );

  const textModels = state.textModels;
  const selected = useMemo(
    () =>
      textModels
        .filter((model) => state.selectedModels.has(model))
        .slice(0, maxComparisonModelCount),
    [state.selectedModels, textModels],
  );
  const selectedTranscriptions = useMemo(
    () =>
      state.transcriptionModels
        .filter((model) => state.selectedTranscriptionModels.has(model))
        .slice(0, maxComparisonModelCount),
    [state.selectedTranscriptionModels, state.transcriptionModels],
  );

  return {
    models: state.models,
    modelModalities: state.modelModalities,
    activeModel: state.activeModel,
    textModels,
    selectedModels: state.selectedModels,
    selected,
    transcriptionModels: state.transcriptionModels,
    transcriptionModel: state.transcriptionModel,
    selectedTranscriptionModels: state.selectedTranscriptionModels,
    realtimeTranscriptionModels: state.realtimeTranscriptionModels,
    selectedTranscriptions,
    traditionalTranscriptionModels: state.traditionalTranscriptionModels,
    traditionalTranscriptionModel: state.traditionalTranscriptionModel,
    ttsModels: state.ttsModels,
    ttsModel: state.ttsModel,
    ttsVoice,
    newModel,
    modelEndpointMessage,
    setActiveModel,
    setTranscriptionModel,
    setTraditionalTranscriptionModel,
    setTtsModel,
    setTtsVoice,
    setNewModel,
    addModel,
    upsertModel,
    activateModel,
    toggleModel,
    toggleTranscriptionModel,
    replaceComparisonModel,
  };
}
