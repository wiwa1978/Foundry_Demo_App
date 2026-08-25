import { useBrowserSpeech } from "@media/browser_voice/frontend";
import { useContentExtractor } from "@media/content_extractor/frontend";
import {
  documentAnswerStreamEndpoint,
  useDocumentLibrary,
} from "@media/document_qa/frontend";
import { useImageWorkspace } from "@media/image_comparison/frontend";
import { useLiveTranslation } from "@media/live_translation/frontend";
import { useRealtimeTranscription as useWebRtcTranscription } from "@media/realtime_transcription_webrtc/frontend";
import { useRealtimeTranscription as useWebSocketTranscription } from "@media/realtime_transcription_websocket/frontend";
import { useRealtimeTranslation as useWebRtcTranslation } from "@media/realtime_translation_webrtc/frontend";
import { useRealtimeTranslation as useWebSocketTranslation } from "@media/realtime_translation_websocket/frontend";
import { useRealtimeVoice } from "@media/realtime_voice/frontend";
import { useTranscriptionSession } from "@media/recorded_transcription/frontend";
import { useTraditionalVoiceSession } from "@media/stt_chat_tts/frontend";
import { useChatStream } from "@media/text_chat/frontend";
import {
  comparisonStreamEndpoint,
  streamComparison,
} from "@media/text_chat_comparison/frontend";
import { useTextToSpeechAvatar } from "@media/text_to_speech_avatar/frontend";
import { useTextTranslation } from "@media/text_translation/frontend";
import { useVoiceLive } from "@media/voice_live/frontend";
import { useYouTubeRealtimeTranscription } from "@media/youtube_realtime_transcription/frontend";
import { useYouTubeSummary } from "@media/youtube_summary/frontend";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loadModelRouterRouting, saveModelRouterRouting } from "@/api/admin";
import { loginUrl } from "@/api/auth";
import {
  deleteConversation,
  listConversations,
  loadConversation as loadConversationRequest,
} from "@/api/conversations";
import type { ModelRouterRoutingMode } from "@/api/types";
import type { UseCaseId, UseCaseWorkspace } from "@/app/types";
import { useCaseModules } from "@/app/useCaseRegistry";
import {
  deploymentDefaultGuardrail,
  isRealtimeOnlyTranscriptionModel,
  traditionalTtsVoices,
} from "@/app/workspace/constants";
import type { ViewMode } from "@/app/workspace/contracts";
import {
  createAssistantMessage,
  createUserMessage,
  mapStoredMessage,
} from "@/app/workspace/messageUtils";
import type { WorkspaceContentRouterProps } from "@/app/workspace/routes/contracts";
import { useApiTrace } from "@/app/workspace/useApiTrace";
import { useWorkspaceAppearance } from "@/app/workspace/useWorkspaceAppearance";
import type { ModelUsageSummary } from "@/features/admin/ModelMonitoringPage";
import { useAdminDeployment } from "@/features/admin/useAdminDeployment";
import { useLiveTranslationSettings } from "@/features/admin/useLiveTranslationSettings";
import { useUseCaseModelMapSettings } from "@/features/admin/useUseCaseModelMapSettings";
import { useAzureArchitectAgentStream } from "@/features/azureArchitectAgent/useAzureArchitectAgentStream";
import { useGuardrailBatch } from "@/features/guardrails/useGuardrailBatch";
import { useGuardrailComparison } from "@/features/guardrails/useGuardrailComparison";
import { useHostedAgentStream } from "@/features/hostedAgent/useHostedAgentStream";
import { useInvestmentPlannerStream } from "@/features/investmentPlanner/useInvestmentPlannerStream";
import { useModelMetrics } from "@/features/metrics/useModelMetrics";
import { useModelMonitoring } from "@/features/metrics/useModelMonitoring";
import { useModelCatalog } from "@/features/models/useModelCatalog";
import { useModelSettingsController } from "@/features/models/useModelSettingsController";
import { useRetailAgentStream } from "@/features/retailAgent/useRetailAgentStream";
import type {
  ChatMessage,
  Conversation,
  ReasoningEffort,
  TextChatRequest,
} from "@/features/textChat/types";
import { useVideoTranslation } from "@/features/videoTranslation/useVideoTranslation";

import { useAppBootstrap } from "./useAppBootstrap";

function addModelUsage(
  usages: Map<string, ModelUsageSummary>,
  model: string | null | undefined,
  useCase: string,
  role: string,
) {
  const normalizedModel = model?.trim();
  if (!normalizedModel) return;
  const usage = usages.get(normalizedModel) ?? {
    model: normalizedModel,
    useCases: [],
    roles: [],
  };
  if (!usage.useCases.includes(useCase)) usage.useCases.push(useCase);
  if (!usage.roles.includes(role)) usage.roles.push(role);
  usages.set(normalizedModel, usage);
}

function buildModelUsages({
  textModels,
  imageModels,
  imageEditModels,
  transcriptionModels,
  realtimeTranscriptionModels,
  ttsModels,
  embeddingModel,
  realtimeModel,
  realtimeTranslationModel,
  voiceLiveModel,
}: {
  textModels: string[];
  imageModels: string[];
  imageEditModels: string[];
  transcriptionModels: string[];
  realtimeTranscriptionModels: string[];
  ttsModels: string[];
  embeddingModel: string | null | undefined;
  realtimeModel: string | null | undefined;
  realtimeTranslationModel: string | null | undefined;
  voiceLiveModel: string | null | undefined;
}) {
  const usages = new Map<string, ModelUsageSummary>();
  const addMany = (models: string[], useCase: string, role: string) =>
    models.forEach((candidate) =>
      addModelUsage(usages, candidate, useCase, role),
    );

  addMany(textModels, "Text Chat", "Chat completion");
  addMany(textModels, "Side by Side – Text Chat", "Comparison");
  addMany(textModels, "Reasoning Arena", "Reasoning comparison");
  addMany(textModels, "Document Q&A", "Grounded answer");
  addModelUsage(usages, embeddingModel, "Document Q&A", "Embeddings");
  addMany(imageModels, "Text to Image", "Image generation");
  addMany(imageModels, "Side by Side – Text Image", "Image comparison");
  addMany(imageEditModels, "Image to Image", "Image editing");
  addMany(textModels, "Youtube Video Summarization", "Summarization");
  addMany(transcriptionModels, "Youtube Video Summarization", "Transcription");
  addMany(
    realtimeTranscriptionModels,
    "Youtube Video Transcription",
    "Realtime transcription",
  );
  addMany(textModels, "Browser based Voice", "Chat completion");
  addMany(transcriptionModels, "STT-Chat-TTS", "Speech to text");
  addMany(textModels, "STT-Chat-TTS", "Chat completion");
  addMany(ttsModels, "STT-Chat-TTS", "Text to speech");
  addMany(transcriptionModels, "Recorded Audio Transcription", "Transcription");
  addMany(
    transcriptionModels,
    "Side by Side Recorded Audio Transcription",
    "Transcription comparison",
  );
  addMany(
    realtimeTranscriptionModels,
    "Realtime Transcription webrtc",
    "Realtime transcription",
  );
  addMany(
    realtimeTranscriptionModels,
    "Realtime Transcription websockets",
    "Realtime transcription",
  );
  addModelUsage(
    usages,
    realtimeTranslationModel,
    "GPT Realtime Translation",
    "Foundry realtime translation",
  );
  addModelUsage(
    usages,
    realtimeModel,
    "Realtime Speech in / Speech Out",
    "Realtime speech",
  );
  addModelUsage(
    usages,
    voiceLiveModel,
    "Voice Live travel Concierge",
    "Voice Live",
  );

  return Array.from(usages.values()).sort((left, right) =>
    left.model.localeCompare(right.model),
  );
}

export function useWorkspaceController() {
  const [comparisonMode, setComparisonMode] = useState(false);
  const [activeUseCase, setActiveUseCase] = useState<UseCaseId>("text_chat");
  useEffect(() => {
    if (activeUseCase === "language_detection") {
      setActiveUseCase("text_translation");
    }
  }, [activeUseCase]);
  const [useCaseMarketplaceOpen, setUseCaseMarketplaceOpen] = useState(false);
  const [useCaseDetailsOpen, setUseCaseDetailsOpen] = useState(false);
  const [useCaseDocumentationOpen, setUseCaseDocumentationOpen] =
    useState(false);
  const [prompt, setPrompt] = useState("");
  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffort>("medium");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);
  const useCaseSessionRef = useRef(0);
  const contentExtractorFileInputRef = useRef<HTMLInputElement>(null);
  const [conversationsOpen, setConversationsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [activeView, setActiveView] = useState<ViewMode>("chat");
  const openModelSettingsView = useCallback(
    () => setActiveView("model-settings"),
    [],
  );
  const apiTrace = useApiTrace();
  const appearance = useWorkspaceAppearance();
  const {
    config,
    auth,
    entraAuthEnabled,
    canUseProtectedApis,
    workspaceLocked: isWorkspaceLocked,
    apiUnavailable,
    apiUnavailableReason,
    retryApiConnection,
  } = useAppBootstrap(apiTrace.tracedFetch);
  const workspaceLocked = isWorkspaceLocked(activeView);
  const activeUseCaseDetails = useMemo(
    () =>
      useCaseModules.find((useCase) => useCase.id === activeUseCase) ??
      useCaseModules[0],
    [activeUseCase],
  );
  const [agentMode, setAgentModeState] = useState<"prompt" | "hosted">(
    "prompt",
  );
  const [languageLearningMode, setLanguageLearningMode] = useState<
    "batch" | "realtime"
  >("batch");
  const effectiveWorkspace: UseCaseWorkspace =
    activeUseCase === "azure_architect_agent" && agentMode === "hosted"
      ? "hostedAgent"
      : activeUseCase === "language_learning" &&
          languageLearningMode === "realtime"
        ? "realtimeTranslationWebSocket"
      : activeUseCaseDetails.workspace;
  const {
    models,
    modelModalities,
    activeModel,
    selectedModels,
    selected,
    textModels,
    transcriptionModels,
    realtimeTranscriptionModels,
    transcriptionModel,
    selectedTranscriptionModels,
    selectedTranscriptions,
    traditionalTranscriptionModels,
    traditionalTranscriptionModel,
    ttsModels,
    ttsModel,
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
  } = useModelCatalog({
    fetchClient: apiTrace.tracedFetch,
    config,
    canUseProtectedApis,
    workspace: activeUseCaseDetails.workspace,
  });
  const gptAudioModels = useMemo(
    () =>
      ttsModels.filter((model) => model.toLowerCase().includes("gpt-audio")),
    [ttsModels],
  );
  const [azureSpeechModel, setAzureSpeechModel] = useState(
    "DragonHDLatestNeural",
  );
  const [azureSpeechVoiceName, setAzureSpeechVoiceName] = useState("Ava");
  const [azureSpeechLanguageSkill, setAzureSpeechLanguageSkill] =
    useState("auto");
  const [azureSpeechEmotion, setAzureSpeechEmotion] = useState("neutral");
  const [azureSpeechPitch, setAzureSpeechPitch] = useState(1);
  const [azureSpeechRate, setAzureSpeechRate] = useState(1);
  const [azureSpeechVolume, setAzureSpeechVolume] = useState(1);
  const [foundryGptAudioModel, setFoundryGptAudioModel] =
    useState("gpt-audio-mini");
  const [foundryGptAudioVoice, setFoundryGptAudioVoice] = useState("alloy");
  useEffect(() => {
    if (
      gptAudioModels.length > 0 &&
      !gptAudioModels.includes(foundryGptAudioModel)
    ) {
      setFoundryGptAudioModel(gptAudioModels[0]);
    }
  }, [foundryGptAudioModel, gptAudioModels]);
  const onDeploymentCreated = useCallback(
    (model: string, modalities: Parameters<typeof upsertModel>[1]) => {
      upsertModel(model, modalities);
      activateModel(model);
    },
    [activateModel, upsertModel],
  );
  const adminDeployment = useAdminDeployment({
    fetchClient: apiTrace.tracedFetch,
    onDeploymentCreated,
  });
  const activeModelIsRouter =
    activeModel.trim().toLowerCase() === "model-router";
  const [modelRouterRoutingMode, setModelRouterRoutingMode] =
    useState<ModelRouterRoutingMode>("balanced");
  const [modelRouterRoutingLoading, setModelRouterRoutingLoading] =
    useState(false);
  const [modelRouterRoutingSaving, setModelRouterRoutingSaving] =
    useState(false);
  const [modelRouterRoutingError, setModelRouterRoutingError] = useState("");

  useEffect(() => {
    if (!activeModelIsRouter || !canUseProtectedApis) {
      setModelRouterRoutingError("");
      return;
    }
    const controller = new AbortController();
    setModelRouterRoutingLoading(true);
    setModelRouterRoutingError("");
    void loadModelRouterRouting(
      apiTrace.tracedFetch,
      activeModel,
      controller.signal,
    )
      .then(({ response, data }) => {
        if (!response.ok) {
          throw new Error(
            data.detail || "Failed to load model router routing.",
          );
        }
        setModelRouterRoutingMode(data.mode);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setModelRouterRoutingError(
          error instanceof Error
            ? error.message
            : "Failed to load model router routing.",
        );
      })
      .finally(() => setModelRouterRoutingLoading(false));
    return () => controller.abort();
  }, [
    activeModel,
    activeModelIsRouter,
    apiTrace.tracedFetch,
    canUseProtectedApis,
  ]);

  const changeModelRouterRoutingMode = useCallback(
    async (mode: ModelRouterRoutingMode) => {
      if (!activeModelIsRouter || !canUseProtectedApis) {
        return;
      }
      const previous = modelRouterRoutingMode;
      setModelRouterRoutingMode(mode);
      setModelRouterRoutingSaving(true);
      setModelRouterRoutingError("");
      try {
        const { response, data } = await saveModelRouterRouting(
          apiTrace.tracedFetch,
          activeModel,
          mode,
        );
        if (!response.ok) {
          throw new Error(
            data.detail || "Failed to save model router routing.",
          );
        }
        setModelRouterRoutingMode(data.mode);
      } catch (error) {
        setModelRouterRoutingMode(previous);
        setModelRouterRoutingError(
          error instanceof Error
            ? error.message
            : "Failed to save model router routing.",
        );
      } finally {
        setModelRouterRoutingSaving(false);
      }
    },
    [
      activeModel,
      activeModelIsRouter,
      apiTrace.tracedFetch,
      canUseProtectedApis,
      modelRouterRoutingMode,
    ],
  );
  const liveTranslationSettings = useLiveTranslationSettings({
    fetchClient: apiTrace.tracedFetch,
    enabled: canUseProtectedApis,
  });
  const useCaseModelMapSettings = useUseCaseModelMapSettings({
    fetchClient: apiTrace.tracedFetch,
    enabled: canUseProtectedApis,
  });
  const modelSettingsController = useModelSettingsController({
    fetchClient: apiTrace.tracedFetch,
    activeModel,
    upsertModel,
    onOpen: openModelSettingsView,
  });
  const guardrailComparison = useGuardrailComparison({
    fetchClient: apiTrace.tracedFetch,
    activeModel,
  });
  const guardrailBatch = useGuardrailBatch({
    fetchClient: apiTrace.tracedFetch,
    activeModel,
  });
  const imageWorkspace = useImageWorkspace({
    fetchClient: apiTrace.tracedFetch,
    models,
    modelModalities,
    workspace: activeUseCaseDetails.workspace,
    onModelChange: setActiveModel,
  });
  const documentLibrary = useDocumentLibrary({
    fetchClient: apiTrace.tracedFetch,
    enabled:
      canUseProtectedApis &&
      activeUseCase === "document_qa" &&
      config?.is_document_rag_configured === true,
    appendFoundryTrace: apiTrace.appendFoundryTrace,
    appendFoundryResponseTrace: apiTrace.appendFoundryResponseTrace,
    appendApiResponseTrace: apiTrace.appendApiResponseTrace,
  });
  const metricsController = useModelMetrics({
    fetchClient: apiTrace.tracedFetch,
    enabled: activeView === "metrics" && canUseProtectedApis,
  });
  const {
    availableSpeechVoices,
    changeVoiceModel,
    isListening,
    selectedSpeechVoiceURI,
    selectedVoiceModel,
    setSelectedSpeechVoiceURI,
    speakResponses,
    speechRecognitionSupported,
    speechSynthesisSupported,
    stopDictation,
    toggleDictation,
    toggleReadback,
    voiceError,
    voiceReadbackEnabled,
  } = useBrowserSpeech({
    models: textModels,
    comparisonMode,
    setActiveModel,
    setPrompt,
  });
  const traditionalVoice = useTraditionalVoiceSession({
    fetchClient: apiTrace.tracedFetch,
    sessionRef: useCaseSessionRef,
    appendApiTrace: apiTrace.append,
    appendFoundryTrace: apiTrace.appendFoundryTrace,
    appendFoundryResponseTrace: apiTrace.appendFoundryResponseTrace,
    appendApiResponseTrace: apiTrace.appendApiResponseTrace,
    onComplete: (result) => {
      setCurrentConversationId(result.conversation.id);
      upsertConversation(result.conversation);
      setMessages((current) => [
        ...current,
        mapStoredMessage(result.user_message),
        ...result.results.map((variant) =>
          mapStoredMessage(variant.assistant_message),
        ),
      ]);
    },
  });
  const [languageLearningLanguage, setLanguageLearningLanguage] =
    useState("en-US");
  const transcription = useTranscriptionSession({
    fetchClient: apiTrace.tracedFetch,
    model: transcriptionModel,
  });
  const transcriptionComparison = useTranscriptionSession({
    fetchClient: apiTrace.tracedFetch,
    model: selectedTranscriptions[0] ?? "",
    models: selectedTranscriptions,
  });
  const realtime = useRealtimeVoice({
    fetchClient: apiTrace.tracedFetch,
    model: config?.realtime_model ?? "gpt-realtime-2.1",
  });
  const defaultRealtimeTranscriptionModel =
    config?.realtime_transcription_model ??
    realtimeTranscriptionModels[0] ??
    "";
  const realtimeTranscriptionWebRtc = useWebRtcTranscription({
    fetchClient: apiTrace.tracedFetch,
    transport: "webrtc",
  });
  const realtimeTranscriptionWebSocket = useWebSocketTranscription({
    fetchClient: apiTrace.tracedFetch,
    transport: "websocket",
  });
  const youtubeRealtimeTranscription = useYouTubeRealtimeTranscription({
    models: realtimeTranscriptionModels,
    defaultModel: defaultRealtimeTranscriptionModel,
  });
  const realtimeTranslationModels = Array.from(
    new Set(
      [
        config?.realtime_translation_model,
        ...models.filter((candidate) => {
          const normalized = candidate.toLowerCase();
          return (
            normalized.includes("realtime") && normalized.includes("translate")
          );
        }),
        "gpt-realtime-translate",
      ].filter(
        (candidate): candidate is string =>
          typeof candidate === "string" && candidate.trim().length > 0,
      ),
    ),
  );
  const realtimeTranslationWebRtc = useWebRtcTranslation({
    defaultModel:
      config?.realtime_translation_model ?? "gpt-realtime-translate",
    fetchClient: apiTrace.tracedFetch,
    models: realtimeTranslationModels,
    defaultTranscriptionModel: defaultRealtimeTranscriptionModel,
    transport: "webrtc",
  });
  const realtimeTranslationWebSocket = useWebSocketTranslation({
    defaultModel:
      config?.realtime_translation_model ?? "gpt-realtime-translate",
    models: realtimeTranslationModels,
    defaultTranscriptionModel: defaultRealtimeTranscriptionModel,
    mode: activeUseCase === "language_learning" ? "tutor" : "translation",
  });
  const setRealtimeTargetLanguage =
    realtimeTranslationWebSocket.setTargetLanguage;
  useEffect(() => {
    if (activeUseCase === "language_learning") {
      setRealtimeTargetLanguage(languageLearningLanguage.split("-")[0] ?? "en");
    }
  }, [activeUseCase, languageLearningLanguage, setRealtimeTargetLanguage]);
  const voiceLive = useVoiceLive({
    model: config?.voice_live_model ?? "gpt-realtime",
    voice: config?.voice_live_voice ?? "en-US-Ava:DragonHDLatestNeural",
  });
  const textToSpeechAvatar = useTextToSpeechAvatar({
    configured: config?.is_speech_transcription_configured ?? false,
    fetchClient: apiTrace.tracedFetch,
  });
  const liveTranslation = useLiveTranslation();
  const contentExtractor = useContentExtractor({
    fetchClient: apiTrace.tracedFetch,
  });
  const youtubeSummary = useYouTubeSummary({
    fetchClient: apiTrace.tracedFetch,
    appendFoundryTrace: apiTrace.appendFoundryTrace,
    appendFoundryResponseTrace: apiTrace.appendFoundryResponseTrace,
  });
  const videoTranslation = useVideoTranslation({
    fetchClient: apiTrace.tracedFetch,
    defaultTranscriptionModel: config?.speech_transcription_model ?? "",
  });
  const textTranslation = useTextTranslation({
    fetchClient: apiTrace.tracedFetch,
    activeUseCase,
    textModels,
  });
  const chatStream = useChatStream({
    fetchClient: apiTrace.tracedFetch,
    sessionRef: useCaseSessionRef,
    deploymentDefaultGuardrail,
    setPrompt,
    setIsRunning,
    setMessages,
    setCurrentConversationId,
    upsertConversation,
    appendFoundryTrace: apiTrace.appendFoundryTrace,
    appendFoundryResponseTrace: apiTrace.appendFoundryResponseTrace,
    appendApiResponseTrace: apiTrace.appendApiResponseTrace,
    onDocumentRetrieval: (event) => {
      if (event.embedding.foundry_request) {
        apiTrace.appendFoundryTrace(
          event.embedding.foundry_request,
          "Foundry embeddings for document question",
        );
      }
      if (event.embedding.foundry_response) {
        apiTrace.appendFoundryResponseTrace(
          event.embedding.foundry_response,
          "Foundry embeddings response",
        );
      }
      apiTrace.append({
        direction: "api_frontend",
        label: "Azure AI Search retrieval results",
        method: "RECV",
        url: documentAnswerStreamEndpoint,
        response: {
          sources: event.sources.map((source) => ({
            filename: source.filename,
            chunk_index: source.chunk_index,
            score: source.score,
            preview: source.content.slice(0, 300),
          })),
        },
      });
    },
    speakResponses,
  });
  const azureArchitectAgent = useAzureArchitectAgentStream({
    fetchClient: apiTrace.tracedFetch,
  });
  const hostedAgentVariants = useMemo(
    () =>
      (config?.hosted_agent_variants ?? []).map((variant) => ({
        key: variant.key,
        label: variant.label,
        agentName: variant.agent_name,
      })),
    [config?.hosted_agent_variants],
  );
  const hostedAgent = useHostedAgentStream({
    fetchClient: apiTrace.tracedFetch,
    variants: hostedAgentVariants,
  });
  const setAgentMode = useCallback(
    (mode: "prompt" | "hosted") => {
      azureArchitectAgent.cancel();
      hostedAgent.cancel();
      setAgentModeState(mode);
    },
    [azureArchitectAgent, hostedAgent],
  );
  const investmentPlanner = useInvestmentPlannerStream({
    fetchClient: apiTrace.tracedFetch,
  });
  const retailAgent = useRetailAgentStream({
    fetchClient: apiTrace.tracedFetch,
  });
  const cancelChatStreamRef = useRef(chatStream.cancel);
  cancelChatStreamRef.current = chatStream.cancel;
  const refreshConversations = useCallback(async () => {
    setConversations(
      await listConversations(apiTrace.tracedFetch, activeUseCase),
    );
  }, [activeUseCase, apiTrace.tracedFetch]);

  useEffect(() => {
    if (!canUseProtectedApis) {
      setConversations([]);
      return;
    }
    void refreshConversations();
  }, [canUseProtectedApis, refreshConversations]);

  useEffect(
    () => () => {
      cancelChatStreamRef.current();
    },
    [],
  );

  async function startNewChat() {
    chatStream.cancel();
    setActiveView("chat");
    setCurrentConversationId(null);
    setMessages([]);
    setPrompt("");
  }

  function selectUseCase(useCase: UseCaseId) {
    const normalizedUseCase =
      useCase === "language_detection" ? "text_translation" : useCase;
    const nextUseCase =
      useCaseModules.find((module) => module.id === normalizedUseCase) ??
      useCaseModules[0];
    if (
      (nextUseCase.workspace === "image" ||
        nextUseCase.workspace === "imageEdit" ||
        nextUseCase.workspace === "imageComparison") &&
      imageWorkspace.model
    ) {
      setActiveModel(imageWorkspace.model);
    }
    if (nextUseCase.workspace === "comparison") {
      if (useCase === "reasoning_comparison") {
        setReasoningEffort("high");
        const reasoningModel = textModels.find(
          (model) => model.toLowerCase() === "mai-thinking-1",
        );
        if (reasoningModel) {
          let projectedSize = selectedModels.size;
          if (!selectedModels.has(reasoningModel)) {
            if (selectedModels.size >= 2) {
              const [modelToReplace] = selectedModels;
              if (modelToReplace) {
                replaceComparisonModel(modelToReplace, reasoningModel);
              }
            } else {
              toggleModel(reasoningModel);
              projectedSize += 1;
            }
          }
          textModels
            .filter(
              (model) => model !== reasoningModel && !selectedModels.has(model),
            )
            .slice(0, Math.max(0, 2 - projectedSize))
            .forEach(toggleModel);
        } else {
          textModels
            .filter((model) => !selectedModels.has(model))
            .slice(0, Math.max(0, 2 - selectedModels.size))
            .forEach(toggleModel);
        }
      } else {
        textModels
          .filter((model) => !selectedModels.has(model))
          .slice(0, Math.max(0, 2 - selectedModels.size))
          .forEach(toggleModel);
      }
    }
    if (normalizedUseCase !== activeUseCase) {
      chatStream.cancel();
      azureArchitectAgent.reset();
      hostedAgent.reset();
      investmentPlanner.reset();
      retailAgent.reset();
      useCaseSessionRef.current += 1;
      setCurrentConversationId(null);
      setMessages([]);
      setPrompt("");
      setIsRunning(false);
    }
    setActiveUseCase(normalizedUseCase);
    setActiveView("chat");
    setUseCaseMarketplaceOpen(false);
    setComparisonMode(
      nextUseCase.workspace === "comparison" ||
        nextUseCase.workspace === "imageComparison",
    );
    if (!nextUseCase.enableComposerDictation && isListening) {
      stopDictation();
    }
    if (
      nextUseCase.workspace !== "realtimeVoice" &&
      realtime.status !== "idle"
    ) {
      realtime.stop();
    }
    if (
      nextUseCase.workspace !== "realtimeTranscriptionWebRtc" &&
      realtimeTranscriptionWebRtc.status !== "idle"
    ) {
      realtimeTranscriptionWebRtc.stop();
    }
    if (
      nextUseCase.workspace !== "realtimeTranscriptionWebSocket" &&
      realtimeTranscriptionWebSocket.status !== "idle"
    ) {
      realtimeTranscriptionWebSocket.stop();
    }
    if (
      nextUseCase.workspace !== "realtimeTranslationWebRtc" &&
      realtimeTranslationWebRtc.status !== "idle"
    ) {
      realtimeTranslationWebRtc.stop();
    }
    if (
      nextUseCase.workspace !== "realtimeTranslationWebSocket" &&
      realtimeTranslationWebSocket.status !== "idle"
    ) {
      realtimeTranslationWebSocket.stop();
    }
    if (nextUseCase.workspace !== "voiceLive" && voiceLive.status !== "idle") {
      voiceLive.stop();
    }
    if (
      nextUseCase.workspace !== "textToSpeechAvatar" &&
      textToSpeechAvatar.status !== "idle"
    ) {
      textToSpeechAvatar.stop();
    }
    if (
      nextUseCase.workspace !== "liveTranslation" &&
      liveTranslation.status !== "idle"
    ) {
      liveTranslation.stop();
    }
    if (nextUseCase.workspace !== "contentExtractor") {
      contentExtractor.reset();
    }
    if (nextUseCase.workspace !== "textTranslation") {
      textTranslation.reset();
    }
    if (nextUseCase.workspace !== "traditionalVoice") {
      traditionalVoice.invalidate();
    }
    if (nextUseCase.workspace !== "transcribe") {
      transcription.invalidate();
    }
    if (nextUseCase.workspace !== "youtubeSummary") {
      youtubeSummary.invalidate();
    }
    if (nextUseCase.workspace !== "videoTranslation") {
      videoTranslation.reset();
    }
  }

  async function loadConversation(conversationId: string) {
    chatStream.cancel();
    const data = await loadConversationRequest(
      apiTrace.tracedFetch,
      conversationId,
      activeUseCase,
    );
    setActiveView("chat");
    setCurrentConversationId(data.conversation.id);
    setMessages((data.messages ?? []).map(mapStoredMessage));
  }

  async function deleteConversationById(conversation: Conversation) {
    const confirmed = window.confirm(`Delete "${conversation.title}"?`);
    if (!confirmed) {
      return;
    }

    if (!(await deleteConversation(apiTrace.tracedFetch, conversation.id))) {
      return;
    }

    setConversations((current) =>
      current.filter((item) => item.id !== conversation.id),
    );
    if (currentConversationId === conversation.id) {
      setCurrentConversationId(null);
      setMessages([]);
      setPrompt("");
    }
  }

  function upsertConversation(conversation: Conversation) {
    setConversations((current) => [
      conversation,
      ...current.filter((item) => item.id !== conversation.id),
    ]);
  }

  function chatRequest(userPrompt: string): TextChatRequest {
    return {
      model: activeModel,
      prompt: userPrompt,
      conversation_id: currentConversationId,
      reasoning_effort: reasoningEffort === "default" ? null : reasoningEffort,
      guardrail_comparison: guardrailComparison.enabled,
      use_case: activeUseCase,
    };
  }

  async function runChat() {
    const userPrompt = prompt.trim();
    if (userPrompt && activeModel) {
      await chatStream.runTextChat(chatRequest(userPrompt));
    }
  }

  async function runDocumentChat() {
    const userPrompt = prompt.trim();
    if (userPrompt && activeModel && documentLibrary.documents.length) {
      await chatStream.runDocumentChat(chatRequest(userPrompt));
    }
  }

  async function runComparison() {
    if (!prompt.trim() || !selected.length) {
      return;
    }

    const userPrompt = prompt.trim();
    const useCaseSession = useCaseSessionRef.current;
    const requestedModels = [...selected];
    const pendingUser = createUserMessage(userPrompt);
    const pendingResponses = new Map(
      requestedModels.map((model) => [
        model,
        createAssistantMessage({ model, pending: true }),
      ]),
    );
    setPrompt("");
    setIsRunning(true);
    setMessages((current) => [
      ...current,
      pendingUser,
      ...pendingResponses.values(),
    ]);

    try {
      const requestBody = {
        models: requestedModels,
        prompt: userPrompt,
        conversation_id: currentConversationId,
        reasoning_effort:
          reasoningEffort === "default" ? null : reasoningEffort,
        use_case: activeUseCase,
      };
      await streamComparison({
        fetchClient: apiTrace.tracedFetch,
        request: requestBody,
        onEvent: (event) => {
          if (useCaseSession !== useCaseSessionRef.current) return;
          if (event.type === "start") {
            setCurrentConversationId(event.conversation.id);
            upsertConversation(event.conversation);
            setMessages((current) =>
              current.map((message) =>
                message.id === pendingUser.id
                  ? mapStoredMessage(event.user_message)
                  : message,
              ),
            );
            return;
          }
          if (event.type === "completed") {
            setCurrentConversationId(event.conversation.id);
            upsertConversation(event.conversation);
            return;
          }

          const results =
            "variants" in event.result ? event.result.variants : [event.result];
          const assistantMessages = results.map(
            (result) => result.assistant_message,
          );
          const pendingResponse = pendingResponses.get(event.model);
          if (pendingResponse) {
            setMessages((current) =>
              current.flatMap((message) =>
                message.id === pendingResponse.id
                  ? assistantMessages.map(mapStoredMessage)
                  : [message],
              ),
            );
          }
          for (const result of results) {
            if (result.foundry_request) {
              apiTrace.appendFoundryTrace(
                result.foundry_request,
                `Foundry request for ${result.model}`,
              );
            }
            if (result.foundry_response) {
              apiTrace.appendFoundryResponseTrace(
                result.foundry_response,
                `Foundry response for ${result.model}`,
              );
            }
          }
          apiTrace.appendApiResponseTrace({
            label: `Compare model response for ${event.model}`,
            method: "RECV",
            url: comparisonStreamEndpoint,
            status: 200,
            response: event.result,
          });
          speakResponses(
            assistantMessages.filter(
              (message) =>
                message.guardrail_variant !== "guarded" &&
                message.guardrail_variant !== "policy_2",
            ),
          );
        },
      });
    } finally {
      if (useCaseSession === useCaseSessionRef.current) {
        setIsRunning(false);
      }
    }
  }

  const canSubmit =
    !isRunning &&
    canUseProtectedApis &&
    Boolean(prompt.trim()) &&
    (comparisonMode
      ? selected.length > 0
      : activeUseCase === "document_qa"
        ? Boolean(
            activeModel &&
            config?.is_document_rag_configured &&
            documentLibrary.documents.length,
          )
        : Boolean(activeModel));
  const authDisplayName = auth?.name || auth?.email || "Signed in";
  const youtubeTranscriptionModels = Array.from(
    new Set(
      [
        ...transcriptionModels,
        config?.speech_transcription_model,
        config?.transcription_model,
      ].filter(
        (model): model is string =>
          typeof model === "string" && !isRealtimeOnlyTranscriptionModel(model),
      ),
    ),
  );
  const youtubeTranscriptionModel = youtubeTranscriptionModels.includes(
    transcriptionModel,
  )
    ? transcriptionModel
    : (youtubeTranscriptionModels[0] ?? "");
  const youtubeRealtimeTranscriptionModel =
    realtimeTranscriptionModels.includes(youtubeRealtimeTranscription.model)
      ? youtubeRealtimeTranscription.model
      : (realtimeTranscriptionModels[0] ?? defaultRealtimeTranscriptionModel);
  const modelUsages = buildModelUsages({
    textModels,
    imageModels: imageWorkspace.models,
    imageEditModels: imageWorkspace.editModels,
    transcriptionModels: youtubeTranscriptionModels,
    realtimeTranscriptionModels,
    ttsModels,
    embeddingModel: config?.embedding_model,
    realtimeModel: config?.realtime_model,
    realtimeTranslationModel: config?.realtime_translation_model,
    voiceLiveModel: config?.voice_live_model,
  });
  const adminViewActive =
    activeView === "evaluation-admin" || activeView === "admin-monitor";
  const monitoringController = useModelMonitoring({
    fetchClient: apiTrace.tracedFetch,
    enabled: adminViewActive && canUseProtectedApis,
    models: modelUsages.map((usage) => usage.model),
  });
  const contentRouterProps: WorkspaceContentRouterProps = {
    route: {
      view: activeView,
      workspace: effectiveWorkspace,
      useCase: activeUseCase,
      renderer: activeUseCaseDetails.renderer,
      enableComposerDictation:
        activeUseCaseDetails.enableComposerDictation === true,
    },
    access: {
      locked: workspaceLocked,
      loading: config === null && !apiUnavailable,
      checking: config !== null && entraAuthEnabled && auth === null,
      canUseProtectedApis,
      onSignIn: () => window.location.assign(loginUrl),
    },
    metrics: {
      ...metricsController,
      models,
    },
    admin: {
      activeTab: activeView === "admin-monitor" ? "monitoring" : "evaluations",
      onTabChange: (tab) =>
        setActiveView(
          tab === "monitoring" ? "admin-monitor" : "evaluation-admin",
        ),
      evaluations: {
        fetchClient: apiTrace.tracedFetch,
        useCases: useCaseModules,
        models,
        agents: config?.hosted_agent_name ? [config.hosted_agent_name] : [],
      },
      monitoring: {
        modelUsages,
        aggregateMetrics: monitoringController.aggregateMetrics,
        modelMetrics: monitoringController.modelMetrics,
        days: monitoringController.days,
        loading: monitoringController.loading,
        error: monitoringController.error,
        setDays: monitoringController.setDays,
        refresh: monitoringController.refresh,
      },
    },
    settings: {
      app: {
        models,
        modelModalities,
        newModel,
        message: modelEndpointMessage,
        colorPalette: appearance.colorPalette,
        canManageModels: canUseProtectedApis,
        liveTranslationSettings: liveTranslationSettings.settings,
        liveTranslationSettingsLoading: liveTranslationSettings.loading,
        liveTranslationSettingsSaving: liveTranslationSettings.saving,
        liveTranslationSettingsMessage: liveTranslationSettings.message,
        useCaseModelMap: useCaseModelMapSettings.useCaseModelMap,
        useCaseModelBucketNames: useCaseModelMapSettings.bucketNames,
        useCaseModelMapLoading: useCaseModelMapSettings.loading,
        useCaseModelMapSaving: useCaseModelMapSettings.saving,
        useCaseModelMapMessage: useCaseModelMapSettings.message,
        onNewModelChange: setNewModel,
        onAddModel: () => void addModel(),
        onOpenAdmin: () => void adminDeployment.open(),
        onOpenEvaluationsAdmin: () => setActiveView("evaluation-admin"),
        onSaveLiveTranslationSettings: liveTranslationSettings.save,
        onSaveUseCaseModelMap: useCaseModelMapSettings.save,
        onSaveCapabilities: modelSettingsController.saveModelCapabilities,
        onColorPaletteChange: appearance.setColorPalette,
      },
      model: {
        ...modelSettingsController,
        onClose: () => {
          modelSettingsController.close();
          setActiveView("chat");
        },
      },
    },
    images: {
      ...imageWorkspace,
      onOpenSettings: (model) => void modelSettingsController.open(model),
    },
    comparison: {
      allModels: textModels,
      models: selected,
      messages,
      prompt,
      isRunning,
      canSubmit,
      reasoningEffort,
      onPromptChange: setPrompt,
      onSubmit: () => void runComparison(),
      onToggleDictation: toggleDictation,
      onOpenSettings: (model) => void modelSettingsController.open(model),
      onModelChange: replaceComparisonModel,
      onReasoningEffortChange: setReasoningEffort,
    },
    traditionalVoice: {
      configured: config?.is_traditional_voice_configured ?? false,
      activeModel,
      chatModels: textModels,
      transcriptionModels: traditionalTranscriptionModels,
      transcriptionModel: traditionalTranscriptionModel,
      ttsModels,
      ttsModel,
      ttsVoice,
      ttsVoices: traditionalTtsVoices,
      status: traditionalVoice.status,
      error: traditionalVoice.error,
      result: traditionalVoice.result,
      request: {
        models: textModels,
        prompt,
        activeModel,
        conversation:
          conversations.find(
            (conversation) => conversation.id === currentConversationId,
          ) ?? null,
        conversationId: currentConversationId,
        useCase: activeUseCase,
        reasoningEffort,
        guardrails: {
          comparisonEnabled: guardrailComparison.enabled,
          policies: guardrailComparison.activePolicies,
        },
        transcriptionModel: traditionalTranscriptionModel,
        tts: { model: ttsModel, voice: ttsVoice },
        language: languageLearningLanguage,
      },
      onChatModelChange: setActiveModel,
      onTranscriptionModelChange: setTraditionalTranscriptionModel,
      onTtsModelChange: setTtsModel,
      onTtsVoiceChange: setTtsVoice,
      language: languageLearningLanguage,
      onLanguageChange: (language: string) => {
        setLanguageLearningLanguage(language);
        textToSpeechAvatar.setLanguage(language);
      },
      onStart: (request) => void traditionalVoice.start(request),
      onStop: traditionalVoice.stop,
    },
    azureSpeechTtsConfigured:
      config?.is_speech_transcription_configured ?? false,
    textToSpeechAvatar,
    foundryGptAudioConfigured: config?.is_traditional_voice_configured ?? false,
    textToSpeech: {
      azureSpeechModel,
      azureVoiceName: azureSpeechVoiceName,
      languageSkill: azureSpeechLanguageSkill,
      emotion: azureSpeechEmotion,
      pitch: azureSpeechPitch,
      rate: azureSpeechRate,
      volume: azureSpeechVolume,
      gptAudioModel: foundryGptAudioModel,
      gptAudioVoice: foundryGptAudioVoice,
    },
    transcription: {
      configured: transcriptionModel.toLowerCase().startsWith("mai-transcribe")
        ? (config?.is_speech_transcription_configured ?? false)
        : (config?.is_configured ?? false),
      model: transcriptionModel,
      status: transcription.status,
      error: transcription.error,
      result: transcription.result,
      language: transcription.language,
      sourceName: transcription.sourceName,
      audioUrl: transcription.audioUrl,
      fileInputRef: transcription.inputRef,
      onLanguageChange: transcription.setLanguage,
      onStart: () => void transcription.start(),
      onStop: transcription.stop,
      onFileSelected: (file) => void transcription.selectFile(file),
    },
    transcriptionComparison: {
      configured:
        selectedTranscriptions.length > 0 &&
        selectedTranscriptions.every((selectedModel) =>
          selectedModel.toLowerCase().startsWith("mai-transcribe")
            ? (config?.is_speech_transcription_configured ?? false)
            : (config?.is_configured ?? false),
        ),
      models: selectedTranscriptions,
      status: transcriptionComparison.status,
      error: transcriptionComparison.error,
      results: transcriptionComparison.results,
      modelErrors: transcriptionComparison.modelErrors,
      pendingModels: transcriptionComparison.pendingModels,
      language: transcriptionComparison.language,
      sourceName: transcriptionComparison.sourceName,
      audioUrl: transcriptionComparison.audioUrl,
      fileInputRef: transcriptionComparison.inputRef,
      onLanguageChange: transcriptionComparison.setLanguage,
      onStart: () => void transcriptionComparison.start(),
      onStop: transcriptionComparison.stop,
      onFileSelected: (file) => void transcriptionComparison.selectFile(file),
    },
    realtime: {
      session: {
        configured: config?.is_realtime_configured ?? false,
        model:
          realtime.sessionModel ?? config?.realtime_model ?? "gpt-realtime-2.1",
        status: realtime.status,
        error: realtime.error,
        guardrailStatus: realtime.guardrailStatus,
        transcript: realtime.transcript,
        onStart: () => void realtime.start(),
        onStop: realtime.stop,
      },
      webRtcTranscription: {
        configured: config?.is_realtime_transcription_configured ?? false,
        model:
          realtimeTranscriptionWebRtc.model ??
          config?.realtime_transcription_model ??
          "gpt-realtime-whisper",
        status: realtimeTranscriptionWebRtc.status,
        error: realtimeTranscriptionWebRtc.error,
        transcript: realtimeTranscriptionWebRtc.transcript,
        language: realtimeTranscriptionWebRtc.language,
        delay: realtimeTranscriptionWebRtc.delay,
        turnDetection: realtimeTranscriptionWebRtc.turnDetection,
        onLanguageChange: realtimeTranscriptionWebRtc.setLanguage,
        onDelayChange: realtimeTranscriptionWebRtc.setDelay,
        onTurnDetectionChange: realtimeTranscriptionWebRtc.setTurnDetection,
        onStart: () => void realtimeTranscriptionWebRtc.start(),
        onStop: realtimeTranscriptionWebRtc.stop,
      },
      webSocketTranscription: {
        configured: config?.is_realtime_transcription_configured ?? false,
        model:
          realtimeTranscriptionWebSocket.model ??
          config?.realtime_transcription_model ??
          "gpt-realtime-whisper",
        status: realtimeTranscriptionWebSocket.status,
        error: realtimeTranscriptionWebSocket.error,
        transcript: realtimeTranscriptionWebSocket.transcript,
        language: realtimeTranscriptionWebSocket.language,
        delay: realtimeTranscriptionWebSocket.delay,
        turnDetection: realtimeTranscriptionWebSocket.turnDetection,
        onLanguageChange: realtimeTranscriptionWebSocket.setLanguage,
        onDelayChange: realtimeTranscriptionWebSocket.setDelay,
        onTurnDetectionChange: realtimeTranscriptionWebSocket.setTurnDetection,
        onStart: () => void realtimeTranscriptionWebSocket.start(),
        onStop: realtimeTranscriptionWebSocket.stop,
      },
      webRtcTranslation: {
        configured: config?.is_realtime_translation_configured ?? false,
        model:
          realtimeTranslationWebRtc.model ??
          config?.realtime_translation_model ??
          "gpt-realtime-translate",
        transcriptionModel: realtimeTranslationWebRtc.transcriptionModel,
        models: realtimeTranslationWebRtc.models,
        sourceLanguage: realtimeTranslationWebRtc.sourceLanguage,
        status: realtimeTranslationWebRtc.status,
        error: realtimeTranslationWebRtc.error,
        targetLanguage: realtimeTranslationWebRtc.targetLanguage,
        sourceTranscript: realtimeTranslationWebRtc.sourceTranscript,
        translatedTranscript: realtimeTranslationWebRtc.translatedTranscript,
        onModelChange: realtimeTranslationWebRtc.setModel,
        onSourceLanguageChange: realtimeTranslationWebRtc.setSourceLanguage,
        onTargetLanguageChange: realtimeTranslationWebRtc.setTargetLanguage,
        onStart: () => void realtimeTranslationWebRtc.start(),
        onStop: realtimeTranslationWebRtc.stop,
      },
      webSocketTranslation: {
        configured: config?.is_realtime_translation_configured ?? false,
        model:
          realtimeTranslationWebSocket.model ??
          config?.realtime_translation_model ??
          "gpt-realtime-translate",
        transcriptionModel: realtimeTranslationWebSocket.transcriptionModel,
        models: realtimeTranslationWebSocket.models,
        sourceLanguage: realtimeTranslationWebSocket.sourceLanguage,
        status: realtimeTranslationWebSocket.status,
        error: realtimeTranslationWebSocket.error,
        targetLanguage: realtimeTranslationWebSocket.targetLanguage,
        sourceTranscript: realtimeTranslationWebSocket.sourceTranscript,
        translatedTranscript: realtimeTranslationWebSocket.translatedTranscript,
        onModelChange: realtimeTranslationWebSocket.setModel,
        onSourceLanguageChange: realtimeTranslationWebSocket.setSourceLanguage,
        onTargetLanguageChange: realtimeTranslationWebSocket.setTargetLanguage,
        onStart: () => void realtimeTranslationWebSocket.start(),
        onStop: realtimeTranslationWebSocket.stop,
      },
      voiceLive: {
        configured: config?.is_voice_live_configured ?? false,
        model: config?.voice_live_model ?? "gpt-realtime",
        voice: config?.voice_live_voice ?? "en-US-Ava:DragonHDLatestNeural",
        status: voiceLive.status,
        error: voiceLive.error,
        transcript: voiceLive.transcript,
        avatar: voiceLive.avatar,
        onStart: () => void voiceLive.start(),
        onStop: voiceLive.stop,
      },
      liveTranslation: {
        configured: config?.is_live_interpreter_configured ?? false,
        status: liveTranslation.status,
        error: liveTranslation.error,
        mode: liveTranslation.mode,
        sourceLanguage: liveTranslation.sourceLanguage,
        targetLanguage: liveTranslation.targetLanguage,
        transcript: liveTranslation.transcript,
        sourceTranscript: liveTranslation.sourceTranscript,
        translatedTranscript: liveTranslation.translatedTranscript,
        audioPlaybackEnabled: liveTranslation.audioPlaybackEnabled,
        onModeChange: liveTranslation.setMode,
        onSourceLanguageChange: liveTranslation.setSourceLanguage,
        onTargetLanguageChange: liveTranslation.setTargetLanguage,
        onAudioPlaybackEnabledChange: liveTranslation.setAudioPlaybackEnabled,
        onStart: () => void liveTranslation.start(),
        onStop: liveTranslation.stop,
      },
    },
    guardrails: {
      enabled: guardrailComparison.enabled,
      policyNames: guardrailComparison.activePolicies,
      deploymentPolicyName: guardrailComparison.deploymentPolicy?.policy_name,
      batch: guardrailBatch,
    },
    contentExtractor: {
      configured: config?.is_content_extractor_configured ?? false,
      mode: contentExtractor.mode,
      file: contentExtractor.file,
      result: contentExtractor.result,
      loading: contentExtractor.loading,
      error: contentExtractor.error,
      fileInputRef: contentExtractorFileInputRef,
      onModeChange: contentExtractor.setMode,
      onFileChange: contentExtractor.setFile,
      onExtract: () => void contentExtractor.extract(),
    },
    textTranslation: {
      configured: config?.is_text_translation_configured ?? false,
      useCase: textTranslation.useCase,
      mode: textTranslation.mode,
      modeOptions: textTranslation.modeOptions,
      modeImplemented: textTranslation.modeImplemented,
      sourceText: textTranslation.sourceText,
      draftText: textTranslation.draftText,
      sourceLanguage: textTranslation.sourceLanguage,
      targetLanguage: textTranslation.targetLanguage,
      model: textTranslation.model,
      modelOptions: textTranslation.modelOptions,
      result: textTranslation.result,
      loading: textTranslation.loading,
      error: textTranslation.error,
      audioEnabled: textTranslation.audioEnabled,
      speaking: textTranslation.speaking,
      onDraftTextChange: textTranslation.setDraftText,
      onSourceLanguageChange: textTranslation.setSourceLanguage,
      onTargetLanguageChange: textTranslation.setTargetLanguage,
      onModelChange: textTranslation.setModel,
      onModeChange: textTranslation.setMode,
      onTranslate: () => void textTranslation.translate(),
      onAudioEnabledChange: textTranslation.setAudioEnabled,
      onSpeakTranslation: () => void textTranslation.speakTranslation(),
    },
    youtubeSummary: {
      url: youtubeSummary.url,
      language: youtubeSummary.language,
      model: activeModel,
      models: textModels,
      transcriptionModel: youtubeTranscriptionModel,
      transcriptionModels: youtubeTranscriptionModels,
      result: youtubeSummary.result,
      loading: youtubeSummary.loading,
      error: youtubeSummary.error,
      onUrlChange: youtubeSummary.setUrl,
      onLanguageChange: youtubeSummary.setLanguage,
      onModelChange: setActiveModel,
      onTranscriptionModelChange: setTranscriptionModel,
      onSummarize: () =>
        void youtubeSummary.summarize(
          activeModel,
          youtubeTranscriptionModel || null,
          reasoningEffort === "default" ? null : reasoningEffort,
        ),
    },
    youtubeRealtimeTranscription: {
      url: youtubeRealtimeTranscription.url,
      model: youtubeRealtimeTranscriptionModel,
      models: realtimeTranscriptionModels,
      language: youtubeRealtimeTranscription.language,
      delay: youtubeRealtimeTranscription.delay,
      status: youtubeRealtimeTranscription.status,
      statusMessage: youtubeRealtimeTranscription.statusMessage,
      error: youtubeRealtimeTranscription.error,
      transcript: youtubeRealtimeTranscription.transcript,
      videoId: youtubeRealtimeTranscription.videoId,
      configured:
        (config?.is_realtime_transcription_configured ?? false) &&
        realtimeTranscriptionModels.length > 0,
      onUrlChange: youtubeRealtimeTranscription.setUrl,
      onModelChange: youtubeRealtimeTranscription.setModel,
      onLanguageChange: youtubeRealtimeTranscription.setLanguage,
      onDelayChange: youtubeRealtimeTranscription.setDelay,
      onStart: () => void youtubeRealtimeTranscription.start(),
      onStop: youtubeRealtimeTranscription.stop,
    },
    videoTranslation: {
      file: videoTranslation.file,
      sourceLanguage: videoTranslation.sourceLanguage,
      targetLanguage: videoTranslation.targetLanguage,
      voice: videoTranslation.voice,
      transcriptionModel: videoTranslation.transcriptionModel,
      result: videoTranslation.result,
      loading: videoTranslation.loading,
      error: videoTranslation.error,
      transcriptionModels,
      onFileChange: videoTranslation.setFile,
      onSourceLanguageChange: videoTranslation.setSourceLanguage,
      onTargetLanguageChange: videoTranslation.setTargetLanguage,
      onVoiceChange: videoTranslation.setVoice,
      onTranscriptionModelChange: videoTranslation.setTranscriptionModel,
      onTranslate: () => void videoTranslation.translate(),
    },
    chat: {
      activeModel,
      models: textModels,
      messages,
      prompt,
      isRunning,
      canSubmit,
      isListening,
      speechRecognitionSupported,
      reasoningEffort,
      modelRouterRouting:
        activeModelIsRouter && canUseProtectedApis
          ? {
              mode: modelRouterRoutingMode,
              loading: modelRouterRoutingLoading,
              saving: modelRouterRoutingSaving,
              error: modelRouterRoutingError,
              onChange: (mode: ModelRouterRoutingMode) =>
                void changeModelRouterRoutingMode(mode),
            }
          : null,
      onPromptChange: setPrompt,
      onSubmit: () => void runChat(),
      onDocumentSubmit: () => void runDocumentChat(),
      onOpenSettings: (model) => void modelSettingsController.open(model),
      onActiveModelChange: setActiveModel,
      onToggleDictation: toggleDictation,
      onReasoningEffortChange: setReasoningEffort,
      onOpenUseCases: () => setUseCaseMarketplaceOpen(true),
    },
    azureArchitectAgent: {
      configured: config?.is_azure_architect_agent_configured ?? false,
      projectEndpoint: config?.endpoint ?? null,
      question: azureArchitectAgent.question,
      answer: azureArchitectAgent.answer,
      steps: azureArchitectAgent.steps,
      citations: azureArchitectAgent.citations,
      runConfig: azureArchitectAgent.runConfig,
      isRunning: azureArchitectAgent.isRunning,
      error: azureArchitectAgent.error,
      trace: azureArchitectAgent.trace,
      traceLoading: azureArchitectAgent.traceLoading,
      traceError: azureArchitectAgent.traceError,
      onQuestionChange: azureArchitectAgent.setQuestion,
      onSubmit: () => void azureArchitectAgent.submit(),
      onCancel: azureArchitectAgent.cancel,
    },
    hostedAgent: {
      configured: config?.is_hosted_agent_configured ?? false,
      agentName: config?.hosted_agent_name ?? null,
      projectEndpoint: config?.endpoint ?? null,
      message: hostedAgent.message,
      answer: hostedAgent.answer,
      steps: hostedAgent.steps,
      runConfig: hostedAgent.runConfig,
      isRunning: hostedAgent.isRunning,
      error: hostedAgent.error,
      variants: hostedAgentVariants,
      variantKey: hostedAgent.variantKey,
      onVariantChange: hostedAgent.setVariantKey,
      onMessageChange: hostedAgent.setMessage,
      onSubmit: () => void hostedAgent.submit(),
      onCancel: hostedAgent.cancel,
    },
    investmentPlanner: {
      configured: config?.is_investment_planner_configured ?? false,
      agentName: config?.investment_planner_agent_name ?? null,
      projectEndpoint: config?.endpoint ?? null,
      question: investmentPlanner.question,
      answer: investmentPlanner.answer,
      steps: investmentPlanner.steps,
      runConfig: investmentPlanner.runConfig,
      isRunning: investmentPlanner.isRunning,
      error: investmentPlanner.error,
      onQuestionChange: investmentPlanner.setQuestion,
      onSubmit: () => void investmentPlanner.submit(),
      onCancel: investmentPlanner.cancel,
    },
    retailAgent: {
      configured: config?.is_retail_agent_configured ?? false,
      agentName: config?.retail_agent_name ?? null,
      projectEndpoint: config?.endpoint ?? null,
      message: retailAgent.message,
      submittedMessage: retailAgent.submittedMessage,
      answer: retailAgent.answer,
      steps: retailAgent.steps,
      products: retailAgent.products,
      cart: retailAgent.cart,
      runConfig: retailAgent.runConfig,
      isRunning: retailAgent.isRunning,
      error: retailAgent.error,
      onMessageChange: retailAgent.setMessage,
      onSubmit: () => void retailAgent.submit(),
      onCancel: retailAgent.cancel,
    },
  };
  return {
    activeView,
    setActiveView,
    activeUseCase,
    activeUseCaseDetails,
    effectiveWorkspace,
    agentMode,
    setAgentMode,
    selectUseCase,
    comparisonMode,
    useCaseMarketplaceOpen,
    setUseCaseMarketplaceOpen,
    useCaseDetailsOpen,
    setUseCaseDetailsOpen,
    useCaseDocumentationOpen,
    setUseCaseDocumentationOpen,
    appearance,
    auth,
    entraAuthEnabled,
    authDisplayName,
    apiTrace,
    workspaceLocked,
    canUseProtectedApis,
    config,
    apiUnavailable,
    apiUnavailableReason,
    retryApiConnection,
    realtime,
    traditionalVoice,
    transcription,
    conversationsOpen,
    setConversationsOpen,
    conversations,
    currentConversationId,
    startNewChat,
    loadConversation,
    deleteConversationById,
    activeModel,
    models,
    textModels,
    transcriptionModels,
    transcriptionModel,
    setActiveModel,
    setTranscriptionModel,
    modelSettingsController,
    documentLibrary,
    availableSpeechVoices,
    isListening,
    selectedSpeechVoiceURI,
    selectedVoiceModel,
    speechRecognitionSupported,
    speechSynthesisSupported,
    voiceError,
    voiceReadbackEnabled,
    changeVoiceModel,
    setSelectedSpeechVoiceURI,
    toggleDictation,
    toggleReadback,
    selectedModels,
    toggleModel,
    selectedTranscriptionModels,
    toggleTranscriptionModel,
    imageWorkspace,
    contentExtractor,
    contentExtractorFileInputRef,
    guardrailComparison,
    isRunning,
    traditionalTranscriptionModels,
    traditionalTranscriptionModel,
    ttsModels,
    ttsModel,
    ttsVoice,
    setTraditionalTranscriptionModel,
    setTtsModel,
    setTtsVoice,
    gptAudioModels,
    azureSpeechModel,
    setAzureSpeechModel,
    azureSpeechVoiceName,
    setAzureSpeechVoiceName,
    azureSpeechLanguageSkill,
    setAzureSpeechLanguageSkill,
    azureSpeechEmotion,
    setAzureSpeechEmotion,
    azureSpeechPitch,
    setAzureSpeechPitch,
    azureSpeechRate,
    setAzureSpeechRate,
    azureSpeechVolume,
    setAzureSpeechVolume,
    foundryGptAudioModel,
    setFoundryGptAudioModel,
    foundryGptAudioVoice,
    setFoundryGptAudioVoice,
    liveTranslation,
    selected,
    selectedTranscriptions,
    contentRouterProps,
    adminDeployment,
  };
}
