import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { FetchClient, ModelModality } from "@/api/types";
import type { UseCaseId, UseCaseWorkspace } from "@/app/types";
import { maxImageComparisonModelCount } from "@/app/workspace/constants";
import type { ImageGenerationResult } from "@/app/workspace/contracts";
import type { Conversation, StoredMessage } from "@/features/textChat/types";

import { editImage, generateImage } from "./api";

type ImageResponse = Omit<ImageGenerationResult, "prompt"> & {
  conversation?: Conversation;
  user_message?: StoredMessage;
  assistant_message?: StoredMessage;
};

type StoredImageGeneration = Omit<ImageGenerationResult, "prompt"> & {
  kind?: string;
  prompt?: string;
};

type ComparisonOutcome = {
  model: string;
  result?: ImageGenerationResult;
  error?: string;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function sameSelection(current: Set<string>, next: string[]) {
  return (
    current.size === next.length && next.every((model) => current.has(model))
  );
}

function imageResultFromMessages(
  messages: StoredMessage[],
): ImageGenerationResult | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") {
      continue;
    }
    const parsed = parseStoredImageGeneration(message.content);
    if (!parsed) {
      continue;
    }
    const prompt =
      parsed.prompt ??
      [...messages]
        .slice(0, index)
        .reverse()
        .find((candidate) => candidate.role === "user")?.content ??
      "";
    return { ...parsed, prompt };
  }
  return null;
}

function parseStoredImageGeneration(
  content: string,
): StoredImageGeneration | null {
  try {
    const parsed = JSON.parse(content) as Partial<StoredImageGeneration>;
    if (
      typeof parsed.model !== "string" ||
      typeof parsed.image_base64 !== "string" ||
      typeof parsed.mime_type !== "string" ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number" ||
      typeof parsed.duration_ms !== "number"
    ) {
      return null;
    }
    return {
      model: parsed.model,
      image_base64: parsed.image_base64,
      mime_type: parsed.mime_type,
      width: parsed.width,
      height: parsed.height,
      duration_ms: parsed.duration_ms,
      prompt: typeof parsed.prompt === "string" ? parsed.prompt : undefined,
    };
  } catch {
    return null;
  }
}

export function useImageWorkspace({
  fetchClient,
  models,
  modelModalities,
  workspace,
  useCase,
  currentConversationId,
  onModelChange,
  onConversationStored,
}: {
  fetchClient: FetchClient;
  models: string[];
  modelModalities: Record<string, ModelModality[]>;
  workspace: UseCaseWorkspace;
  useCase?: UseCaseId;
  currentConversationId?: string | null;
  onModelChange: (model: string) => void;
  onConversationStored?: (conversation: Conversation) => void;
}) {
  const imageModels = useMemo(
    () => models.filter((model) => modelModalities[model]?.includes("image")),
    [modelModalities, models],
  );
  const editModels = useMemo(
    () =>
      imageModels.filter((model) => model.toLowerCase().includes("gpt-image")),
    [imageModels],
  );
  const [model, setModelState] = useState("");
  const [prompt, setPrompt] = useState("");
  const [submittedPrompt, setSubmittedPrompt] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [result, setResult] = useState<ImageGenerationResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [saveToGallery, setSaveToGallery] = useState(false);
  const [editSource, setEditSourceState] = useState<File | null>(null);
  const [editResult, setEditResult] = useState<ImageGenerationResult | null>(
    null,
  );
  const [editGenerating, setEditGenerating] = useState(false);
  const [editError, setEditError] = useState("");
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [comparisonResults, setComparisonResults] = useState<
    Record<string, ImageGenerationResult>
  >({});
  const [comparisonErrors, setComparisonErrors] = useState<
    Record<string, string>
  >({});
  const [comparisonGenerating, setComparisonGenerating] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const modelRef = useRef(model);
  modelRef.current = model;

  const cancelRequests = useCallback(() => {
    generationRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const stopLoading = useCallback(() => {
    setGenerating(false);
    setEditGenerating(false);
    setComparisonGenerating(false);
  }, []);

  const invalidate = useCallback(() => {
    cancelRequests();
    stopLoading();
  }, [cancelRequests, stopLoading]);

  const beginRequest = useCallback(() => {
    cancelRequests();
    const controller = new AbortController();
    controllerRef.current = controller;
    const generation = generationRef.current;
    return { controller, generation };
  }, [cancelRequests]);

  const isCurrent = useCallback(
    (generation: number, controller: AbortController, requestModel?: string) =>
      generation === generationRef.current &&
      !controller.signal.aborted &&
      (!requestModel || modelRef.current === requestModel),
    [],
  );

  const setModel = useCallback(
    (nextModel: string) => {
      if (modelRef.current === nextModel) {
        return;
      }
      invalidate();
      modelRef.current = nextModel;
      setModelState(nextModel);
      onModelChange(nextModel);
    },
    [invalidate, onModelChange],
  );

  const setEditSource = useCallback(
    (source: File | null) => {
      invalidate();
      setEditSourceState(source);
      setEditResult(null);
      setEditError("");
    },
    [invalidate],
  );

  const toggleComparisonModel = useCallback(
    (nextModel: string) => {
      invalidate();
      setSelectedModels((current) => {
        const next = new Set(current);
        if (next.has(nextModel)) {
          next.delete(nextModel);
        } else if (next.size < maxImageComparisonModelCount) {
          next.add(nextModel);
        }
        return next;
      });
    },
    [invalidate],
  );

  const replaceComparisonModel = useCallback(
    (currentModel: string, nextModel: string) => {
      if (currentModel === nextModel) {
        return;
      }
      invalidate();
      setSelectedModels((current) => {
        const next = new Set(current);
        next.delete(currentModel);
        next.add(nextModel);
        return next;
      });
    },
    [invalidate],
  );

  const selected = useMemo(
    () =>
      imageModels
        .filter((imageModel) => selectedModels.has(imageModel))
        .slice(0, maxImageComparisonModelCount),
    [imageModels, selectedModels],
  );

  const runGeneration = useCallback(async () => {
    const submittedPrompt = prompt.trim();
    if (!model || !submittedPrompt || generating) {
      return;
    }
    const [width, height] = size.split("x").map(Number);
    const request = {
      model,
      prompt: submittedPrompt,
      width,
      height,
      ...(useCase === "text_to_image"
        ? { conversation_id: currentConversationId, use_case: useCase }
        : {}),
      ...(useCase === "text_to_image" && saveToGallery
        ? { save_to_gallery: true }
        : {}),
    };
    const { controller, generation } = beginRequest();
    setSubmittedPrompt(request.prompt);
    setPrompt("");
    setGenerating(true);
    setError("");
    try {
      const response = await generateImage(
        fetchClient,
        request,
        controller.signal,
      );
      const data = (await response.json()) as ImageResponse;
      if (isCurrent(generation, controller, request.model)) {
        if (data.conversation) {
          onConversationStored?.(data.conversation);
        }
        setResult({
          model: data.model,
          image_base64: data.image_base64,
          mime_type: data.mime_type,
          width: data.width,
          height: data.height,
          duration_ms: data.duration_ms,
          prompt: request.prompt,
        });
      }
    } catch (generationError) {
      if (isCurrent(generation, controller, request.model)) {
        setError(errorMessage(generationError, "Image generation failed."));
      }
    } finally {
      if (isCurrent(generation, controller, request.model)) {
        setGenerating(false);
      }
    }
  }, [
    beginRequest,
    currentConversationId,
    fetchClient,
    generating,
    isCurrent,
    model,
    onConversationStored,
    prompt,
    saveToGallery,
    size,
    useCase,
  ]);

  const runEdit = useCallback(async () => {
    const submittedPrompt = prompt.trim();
    if (!model || !submittedPrompt || !editSource || editGenerating) {
      return;
    }
    const [width, height] = size.split("x").map(Number);
    const request = {
      model,
      prompt: submittedPrompt,
      width,
      height,
      image: editSource,
    };
    const { controller, generation } = beginRequest();
    setPrompt("");
    setEditGenerating(true);
    setEditError("");
    try {
      const response = await editImage(fetchClient, request, controller.signal);
      const data = (await response.json()) as ImageResponse;
      if (isCurrent(generation, controller, request.model)) {
        setEditResult({ ...data, prompt: request.prompt });
      }
    } catch (editRequestError) {
      if (isCurrent(generation, controller, request.model)) {
        setEditError(errorMessage(editRequestError, "Image edit failed."));
      }
    } finally {
      if (isCurrent(generation, controller, request.model)) {
        setEditGenerating(false);
      }
    }
  }, [
    beginRequest,
    editGenerating,
    editSource,
    fetchClient,
    isCurrent,
    model,
    prompt,
    size,
  ]);

  const runComparison = useCallback(async () => {
    const submittedPrompt = prompt.trim();
    if (!selected.length || !submittedPrompt || comparisonGenerating) {
      return;
    }
    const selectedSnapshot = [...selected];
    const [width, height] = size.split("x").map(Number);
    const { controller, generation } = beginRequest();
    setPrompt("");
    setComparisonGenerating(true);
    setComparisonErrors({});
    const outcomes = await Promise.all(
      selectedSnapshot.map(
        async (selectedModel): Promise<ComparisonOutcome> => {
          const request = {
            model: selectedModel,
            prompt: submittedPrompt,
            width,
            height,
          };
          try {
            const response = await generateImage(
              fetchClient,
              request,
              controller.signal,
            );
            const data = (await response.json()) as ImageResponse;
            return {
              model: selectedModel,
              result: { ...data, prompt: submittedPrompt },
            };
          } catch (comparisonError) {
            return {
              model: selectedModel,
              error: errorMessage(comparisonError, "Image generation failed."),
            };
          }
        },
      ),
    );
    if (!isCurrent(generation, controller)) {
      return;
    }
    setComparisonResults((current) => {
      const next = { ...current };
      for (const outcome of outcomes) {
        if (outcome.result) {
          next[outcome.model] = outcome.result;
        }
      }
      return next;
    });
    const nextErrors: Record<string, string> = {};
    for (const outcome of outcomes) {
      if (outcome.error) {
        nextErrors[outcome.model] = outcome.error;
      }
    }
    setComparisonErrors(nextErrors);
    setComparisonGenerating(false);
  }, [
    beginRequest,
    comparisonGenerating,
    fetchClient,
    isCurrent,
    prompt,
    selected,
    size,
  ]);

  useEffect(() => {
    if (
      workspace !== "image" &&
      workspace !== "imageEdit" &&
      workspace !== "imageComparison"
    ) {
      return;
    }
    const availableModels =
      workspace === "imageEdit" ? editModels : imageModels;
    if (model && availableModels.includes(model)) {
      return;
    }
    invalidate();
    const nextModel = availableModels[0] ?? "";
    modelRef.current = nextModel;
    setModelState(nextModel);
    onModelChange(nextModel);
  }, [editModels, imageModels, invalidate, model, onModelChange, workspace]);

  useEffect(() => {
    const retained = imageModels
      .filter((imageModel) => selectedModels.has(imageModel))
      .slice(0, maxImageComparisonModelCount);
    const next = (retained.length ? retained : imageModels).slice(
      0,
      maxImageComparisonModelCount,
    );
    if (!sameSelection(selectedModels, next)) {
      invalidate();
      setSelectedModels(new Set(next));
    }
  }, [imageModels, invalidate, selectedModels]);

  useEffect(() => {
    invalidate();
  }, [invalidate, workspace]);

  useEffect(
    () => () => {
      generationRef.current += 1;
      controllerRef.current?.abort();
    },
    [],
  );

  const clearHistory = useCallback(() => {
    invalidate();
    setPrompt("");
    setSubmittedPrompt("");
    setResult(null);
    setError("");
  }, [invalidate]);

  const loadGenerationFromMessages = useCallback(
    (messages: StoredMessage[]) => {
      const storedResult = imageResultFromMessages(messages);
      invalidate();
      setPrompt("");
      setError("");
      if (!storedResult) {
        setSubmittedPrompt("");
        setResult(null);
        return;
      }
      setSubmittedPrompt(storedResult.prompt);
      setResult(storedResult);
      if (imageModels.includes(storedResult.model)) {
        modelRef.current = storedResult.model;
        setModelState(storedResult.model);
        onModelChange(storedResult.model);
      }
    },
    [imageModels, invalidate, onModelChange],
  );

  return {
    model,
    models: imageModels,
    editModels,
    prompt,
    submittedPrompt,
    size,
    result,
    generating,
    error,
    editSource,
    editResult,
    editGenerating,
    editError,
    selectedModels,
    selected,
    comparisonResults,
    comparisonErrors,
    comparisonGenerating,
    setModel,
    setPrompt,
    setSize,
    saveToGallery,
    setSaveToGallery,
    setEditSource,
    toggleComparisonModel,
    replaceComparisonModel,
    runGeneration,
    runEdit,
    runComparison,
    clearHistory,
    loadGenerationFromMessages,
  };
}
