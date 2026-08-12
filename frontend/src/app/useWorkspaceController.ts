import { useBrowserSpeech } from "@media/browser_voice/frontend";
import {
  documentAnswerStreamEndpoint,
  useDocumentLibrary,
} from "@media/document_qa/frontend";
import { useImageWorkspace } from "@media/image_comparison/frontend";
import { useLiveTranslation } from "@media/live_translation/frontend";
import { useRealtimeTranscription as useWebRtcTranscription } from "@media/realtime_transcription_webrtc/frontend";
import { useRealtimeTranscription as useWebSocketTranscription } from "@media/realtime_transcription_websocket/frontend";
import { useRealtimeTranslation } from "@media/realtime_translation_websocket/frontend";
import { useRealtimeVoice } from "@media/realtime_voice/frontend";
import { useTranscriptionSession } from "@media/recorded_transcription/frontend";
import { useTraditionalVoiceSession } from "@media/stt_chat_tts/frontend";
import { useChatStream } from "@media/text_chat/frontend";
import {
  comparisonStreamEndpoint,
  streamComparison,
} from "@media/text_chat_comparison/frontend";
import { useVoiceLive } from "@media/voice_live/frontend";
import { useYouTubeSummary } from "@media/youtube_summary/frontend";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loginUrl } from "@/api/auth";
import {
  deleteConversation,
  listConversations,
  loadConversation as loadConversationRequest,
} from "@/api/conversations";
import type { UseCaseId } from "@/app/types";
import { useCaseModules } from "@/app/useCaseRegistry";
import {
  deploymentDefaultGuardrail,
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
import { useAdminDeployment } from "@/features/admin/useAdminDeployment";
import { useLiveTranslationSettings } from "@/features/admin/useLiveTranslationSettings";
import { useAgentResearchStream } from "@/features/agentResearch/useAgentResearchStream";
import { useGuardrailComparison } from "@/features/guardrails/useGuardrailComparison";
import { useHostedAgentStream } from "@/features/hostedAgent/useHostedAgentStream";
import { useModelMetrics } from "@/features/metrics/useModelMetrics";
import { useModelCatalog } from "@/features/models/useModelCatalog";
import { useModelSettingsController } from "@/features/models/useModelSettingsController";
import type {
  ChatMessage,
  Conversation,
  ReasoningEffort,
  TextChatRequest,
} from "@/features/textChat/types";

import { useAppBootstrap } from "./useAppBootstrap";

export function useWorkspaceController() {
  const [comparisonMode, setComparisonMode] = useState(false);
  const [activeUseCase, setActiveUseCase] = useState<UseCaseId>("text_chat");
  const [useCaseMarketplaceOpen, setUseCaseMarketplaceOpen] = useState(false);
  const [useCaseDetailsOpen, setUseCaseDetailsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffort>("medium");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);
  const useCaseSessionRef = useRef(0);
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
  } = useAppBootstrap(apiTrace.tracedFetch);
  const workspaceLocked = isWorkspaceLocked(activeView);
  const activeUseCaseDetails = useMemo(
    () =>
      useCaseModules.find((useCase) => useCase.id === activeUseCase) ??
      useCaseModules[0],
    [activeUseCase],
  );
  const {
    models,
    modelModalities,
    activeModel,
    selectedModels,
    selected,
    textModels,
    transcriptionModels,
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
  const liveTranslationSettings = useLiveTranslationSettings({
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
  const realtimeTranscriptionWebRtc = useWebRtcTranscription({
    fetchClient: apiTrace.tracedFetch,
    transport: "webrtc",
  });
  const realtimeTranscriptionWebSocket = useWebSocketTranscription({
    fetchClient: apiTrace.tracedFetch,
    transport: "websocket",
  });
  const realtimeTranslation = useRealtimeTranslation();
  const voiceLive = useVoiceLive({
    model: config?.voice_live_model ?? "gpt-realtime",
    voice: config?.voice_live_voice ?? "en-US-Ava:DragonHDLatestNeural",
  });
  const liveTranslation = useLiveTranslation();
  const youtubeSummary = useYouTubeSummary({
    fetchClient: apiTrace.tracedFetch,
    appendFoundryTrace: apiTrace.appendFoundryTrace,
    appendFoundryResponseTrace: apiTrace.appendFoundryResponseTrace,
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
  const agentResearch = useAgentResearchStream({
    fetchClient: apiTrace.tracedFetch,
  });
  const hostedAgent = useHostedAgentStream({
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
    const nextUseCase =
      useCaseModules.find((module) => module.id === useCase) ??
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
      textModels
        .filter((model) => !selectedModels.has(model))
        .slice(0, Math.max(0, 2 - selectedModels.size))
        .forEach(toggleModel);
    }
    if (useCase !== activeUseCase) {
      chatStream.cancel();
      agentResearch.reset();
      hostedAgent.reset();
      useCaseSessionRef.current += 1;
      setCurrentConversationId(null);
      setMessages([]);
      setPrompt("");
      setIsRunning(false);
    }
    setActiveUseCase(useCase);
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
      nextUseCase.workspace !== "realtimeTranslationWebSocket" &&
      realtimeTranslation.status !== "idle"
    ) {
      realtimeTranslation.stop();
    }
    if (nextUseCase.workspace !== "voiceLive" && voiceLive.status !== "idle") {
      voiceLive.stop();
    }
    if (
      nextUseCase.workspace !== "liveTranslation" &&
      liveTranslation.status !== "idle"
    ) {
      liveTranslation.stop();
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
      ].filter((model): model is string => Boolean(model)),
    ),
  );
  const youtubeTranscriptionModel = youtubeTranscriptionModels.includes(
    transcriptionModel,
  )
    ? transcriptionModel
    : (youtubeTranscriptionModels[0] ?? "");
  const contentRouterProps: WorkspaceContentRouterProps = {
    route: {
      view: activeView,
      workspace: activeUseCaseDetails.workspace,
      useCase: activeUseCase,
      renderer: activeUseCaseDetails.renderer,
      enableComposerDictation:
        activeUseCaseDetails.enableComposerDictation === true,
    },
    access: {
      locked: workspaceLocked,
      checking: auth === null,
      canUseProtectedApis,
      onSignIn: () => window.location.assign(loginUrl),
    },
    metrics: {
      ...metricsController,
      models,
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
        onNewModelChange: setNewModel,
        onAddModel: () => void addModel(),
        onOpenAdmin: () => void adminDeployment.open(),
        onSaveLiveTranslationSettings: liveTranslationSettings.save,
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
      },
      onChatModelChange: setActiveModel,
      onTranscriptionModelChange: setTraditionalTranscriptionModel,
      onTtsModelChange: setTtsModel,
      onTtsVoiceChange: setTtsVoice,
      onStart: (request) => void traditionalVoice.start(request),
      onStop: traditionalVoice.stop,
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
      webSocketTranslation: {
        configured: config?.is_realtime_translation_configured ?? false,
        model:
          realtimeTranslation.model ??
          config?.realtime_translation_model ??
          "gpt-realtime-translate",
        transcriptionModel: realtimeTranslation.transcriptionModel,
        status: realtimeTranslation.status,
        error: realtimeTranslation.error,
        targetLanguage: realtimeTranslation.targetLanguage,
        sourceTranscript: realtimeTranslation.sourceTranscript,
        translatedTranscript: realtimeTranslation.translatedTranscript,
        onTargetLanguageChange: realtimeTranslation.setTargetLanguage,
        onStart: () => void realtimeTranslation.start(),
        onStop: realtimeTranslation.stop,
      },
      voiceLive: {
        configured: config?.is_voice_live_configured ?? false,
        model: config?.voice_live_model ?? "gpt-realtime",
        voice: config?.voice_live_voice ?? "en-US-Ava:DragonHDLatestNeural",
        status: voiceLive.status,
        error: voiceLive.error,
        transcript: voiceLive.transcript,
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
        onModeChange: liveTranslation.setMode,
        onSourceLanguageChange: liveTranslation.setSourceLanguage,
        onTargetLanguageChange: liveTranslation.setTargetLanguage,
        onStart: () => void liveTranslation.start(),
        onStop: liveTranslation.stop,
      },
    },
    guardrails: {
      enabled: guardrailComparison.enabled,
      policyNames: guardrailComparison.activePolicies,
      deploymentPolicyName: guardrailComparison.deploymentPolicy?.policy_name,
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
      onPromptChange: setPrompt,
      onSubmit: () => void runChat(),
      onDocumentSubmit: () => void runDocumentChat(),
      onOpenSettings: (model) => void modelSettingsController.open(model),
      onActiveModelChange: setActiveModel,
      onToggleDictation: toggleDictation,
      onReasoningEffortChange: setReasoningEffort,
      onOpenUseCases: () => setUseCaseMarketplaceOpen(true),
    },
    agentResearch: {
      configured: config?.is_agent_research_configured ?? false,
      projectEndpoint: config?.endpoint ?? null,
      question: agentResearch.question,
      answer: agentResearch.answer,
      steps: agentResearch.steps,
      citations: agentResearch.citations,
      runConfig: agentResearch.runConfig,
      isRunning: agentResearch.isRunning,
      error: agentResearch.error,
      trace: agentResearch.trace,
      traceLoading: agentResearch.traceLoading,
      traceError: agentResearch.traceError,
      onQuestionChange: agentResearch.setQuestion,
      onSubmit: () => void agentResearch.submit(),
      onCancel: agentResearch.cancel,
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
      onMessageChange: hostedAgent.setMessage,
      onSubmit: () => void hostedAgent.submit(),
      onCancel: hostedAgent.cancel,
    },
  };
  return {
    activeView,
    setActiveView,
    activeUseCase,
    activeUseCaseDetails,
    selectUseCase,
    comparisonMode,
    useCaseMarketplaceOpen,
    setUseCaseMarketplaceOpen,
    useCaseDetailsOpen,
    setUseCaseDetailsOpen,
    appearance,
    auth,
    entraAuthEnabled,
    authDisplayName,
    apiTrace,
    workspaceLocked,
    canUseProtectedApis,
    config,
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
    liveTranslation,
    selected,
    selectedTranscriptions,
    contentRouterProps,
    adminDeployment,
  };
}
