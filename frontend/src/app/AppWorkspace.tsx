import {
  GitCompareArrows,
  HelpCircle,
  Infinity as InfinityIcon,
  LogIn,
  Mic,
  MicOff,
  Plus,
  Settings,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loginUrl } from "@/api/auth";
import {
  deleteConversation,
  listConversations,
  loadConversation as loadConversationRequest,
} from "@/api/conversations";
import type { UseCaseId } from "@/app/types";
import { useCaseModules } from "@/app/useCaseRegistry";
import { AdminDeploymentModal } from "@/app/workspace/AdminDeploymentModal";
import { ApiTraceDrawer } from "@/app/workspace/ApiTraceDrawer";
import { AppSettingsPage } from "@/app/workspace/AppSettingsPage";
import {
  deploymentDefaultGuardrail,
  reasoningEffortOptions,
  traditionalTtsVoices,
} from "@/app/workspace/constants";
import type { ViewMode } from "@/app/workspace/contracts";
import { ConversationHistoryPopover } from "@/app/workspace/ConversationHistoryPopover";
import { formatModelName } from "@/app/workspace/formatters";
import {
  createAssistantMessage,
  createUserMessage,
  mapStoredMessage,
} from "@/app/workspace/messageUtils";
import { ModelMetricsDashboard } from "@/app/workspace/ModelMetricsDashboard";
import { ModelSettingsPage } from "@/app/workspace/ModelSettingsPage";
import { useApiTrace } from "@/app/workspace/useApiTrace";
import { useWorkspaceAppearance } from "@/app/workspace/useWorkspaceAppearance";
import { WorkspaceHeader } from "@/app/workspace/WorkspaceHeader";
import {
  ChatEmptyState,
  ComposerSelect,
  UseCaseComposer,
} from "@/app/workspace/WorkspacePrimitives";
import { WorkspaceSidebar } from "@/app/workspace/WorkspaceSidebar";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { useAdminDeployment } from "@/features/admin/useAdminDeployment";
import { compareModels, comparisonEndpoint } from "@/features/comparison/api";
import { ComparisonWorkspace } from "@/features/comparison/ComparisonWorkspace";
import { documentAnswerStreamEndpoint } from "@/features/documentQa/api";
import { useDocumentLibrary } from "@/features/documentQa/useDocumentLibrary";
import { GuardrailComparisonWorkspace } from "@/features/guardrails/GuardrailWorkspaces";
import { useGuardrailComparison } from "@/features/guardrails/useGuardrailComparison";
import {
  ImageComparisonWorkspace,
  ImageToImageWorkspace,
  TextToImageWorkspace,
} from "@/features/images/ImageWorkspaces";
import { useImageWorkspace } from "@/features/images/useImageWorkspace";
import { UseCaseMarketplace } from "@/features/marketplace/UseCaseMarketplace";
import { useModelMetrics } from "@/features/metrics/useModelMetrics";
import { useModelCatalog } from "@/features/models/useModelCatalog";
import { useModelSettingsController } from "@/features/models/useModelSettingsController";
import { ChatMessageHistory } from "@/features/textChat/ChatMessages";
import type {
  ChatMessage,
  Conversation,
  ModelResult,
  ReasoningEffort,
  StoredMessage,
  TextChatRequest,
} from "@/features/textChat/types";
import { useChatStream } from "@/features/textChat/useChatStream";
import { UseCaseDetailsPanel } from "@/features/useCases/UseCaseDetailsPanel";
import { useBrowserSpeech } from "@/features/voice/useBrowserSpeech";
import { useLiveTranslation } from "@/features/voice/useLiveTranslation";
import { useRealtimeVoice } from "@/features/voice/useRealtimeVoice";
import { useTraditionalVoiceSession } from "@/features/voice/useTraditionalVoiceSession";
import { useTranscriptionSession } from "@/features/voice/useTranscriptionSession";
import { useVoiceLive } from "@/features/voice/useVoiceLive";
import {
  LiveTranslationHero,
  RealtimeVoiceHero,
  TraditionalVoiceWorkspace,
  TranscriptionWorkspace,
  VoiceLiveHero,
} from "@/features/voice/VoiceWorkspaces";
import { cn } from "@/lib/utils";

import { useAppBootstrap } from "./useAppBootstrap";

export default function AppWorkspace() {
  const [comparisonMode, setComparisonMode] = useState(false);
  const [activeUseCase, setActiveUseCase] = useState<UseCaseId>("text_chat");
  const [useCaseMarketplaceOpen, setUseCaseMarketplaceOpen] = useState(false);
  const [useCaseDetailsOpen, setUseCaseDetailsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffort>("default");
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
  const {
    error: traditionalVoiceError,
    invalidate: invalidateTraditionalVoiceSession,
    result: traditionalVoiceResult,
    start: startTraditionalVoiceSession,
    status: traditionalVoiceStatus,
    stop: stopTraditionalRecording,
  } = useTraditionalVoiceSession({
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
  const {
    audioUrl: transcriptionAudioUrl,
    error: transcriptionError,
    inputRef: transcriptionFileInputRef,
    invalidate: invalidateTranscriptionSession,
    language: transcriptionLanguage,
    result: transcriptionResult,
    selectFile: selectTranscriptionFile,
    setLanguage: setTranscriptionLanguage,
    sourceName: transcriptionSourceName,
    start: startTranscriptionRecording,
    status: transcriptionStatus,
    stop: stopTranscriptionRecording,
  } = useTranscriptionSession({
    fetchClient: apiTrace.tracedFetch,
    model: transcriptionModel,
  });
  const {
    status: realtimeStatus,
    error: realtimeError,
    transcript: realtimeTranscript,
    sessionModel: realtimeSessionModel,
    guardrailStatus: realtimeGuardrailStatus,
    start: startRealtimeSession,
    stop: stopRealtimeSession,
  } = useRealtimeVoice({
    fetchClient: apiTrace.tracedFetch,
    model: config?.realtime_model ?? "gpt-realtime-2.1",
  });
  const {
    status: voiceLiveStatus,
    error: voiceLiveError,
    transcript: voiceLiveTranscript,
    start: startVoiceLiveSession,
    stop: stopVoiceLiveSession,
  } = useVoiceLive({
    model: config?.voice_live_model ?? "gpt-realtime",
    voice: config?.voice_live_voice ?? "en-US-Ava:DragonHDLatestNeural",
  });
  const {
    status: liveTranslationStatus,
    error: liveTranslationError,
    targetLanguage: liveTranslationTarget,
    transcript: liveTranslationTranscript,
    setTargetLanguage: setLiveTranslationTarget,
    start: startLiveTranslationSession,
    stop: stopLiveTranslationSession,
  } = useLiveTranslation();
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
    if (useCase !== activeUseCase) {
      chatStream.cancel();
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
      realtimeStatus !== "idle"
    ) {
      stopRealtimeSession();
    }
    if (nextUseCase.workspace !== "voiceLive" && voiceLiveStatus !== "idle") {
      stopVoiceLiveSession();
    }
    if (
      nextUseCase.workspace !== "liveTranslation" &&
      liveTranslationStatus !== "idle"
    ) {
      stopLiveTranslationSession();
    }
    if (nextUseCase.workspace !== "traditionalVoice") {
      invalidateTraditionalVoiceSession();
    }
    if (nextUseCase.workspace !== "transcribe") {
      invalidateTranscriptionSession();
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
    setPrompt("");
    setIsRunning(true);
    setMessages((current) => [
      ...current,
      createUserMessage(userPrompt),
      ...selected.map((model) =>
        createAssistantMessage({ model, pending: true }),
      ),
    ]);

    try {
      const requestBody = {
        models: selected,
        prompt: userPrompt,
        conversation_id: currentConversationId,
        reasoning_effort:
          reasoningEffort === "default" ? null : reasoningEffort,
        use_case: activeUseCase,
      };
      const response = await compareModels(apiTrace.tracedFetch, requestBody);
      const data = await response.json();

      if (useCaseSession !== useCaseSessionRef.current) {
        return;
      }

      if (!response.ok) {
        apiTrace.appendApiResponseTrace({
          label: "Compare models response",
          method: "RECV",
          url: comparisonEndpoint,
          status: response.status,
          response: data,
        });
        replacePendingMessages(selected.length + 1, [
          createUserMessage(userPrompt),
          createAssistantMessage({
            model: "Request failed",
            error: data.detail ?? "Unknown error",
          }),
        ]);
        return;
      }

      setCurrentConversationId(data.conversation.id);
      upsertConversation(data.conversation);
      const flatResults = (data.results ?? []).flatMap(
        (result: { variants?: ModelResult[] }) => result.variants ?? [result],
      );
      for (const result of flatResults) {
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
        label: "Compare models response",
        method: "RECV",
        url: comparisonEndpoint,
        status: response.status,
        response: data,
      });
      const assistantMessages = flatResults.map(
        (result: { assistant_message: StoredMessage }) =>
          result.assistant_message,
      );
      replacePendingMessages(selected.length + 1, [
        mapStoredMessage(data.user_message),
        ...assistantMessages.map(mapStoredMessage),
      ]);
      speakResponses(
        assistantMessages.filter(
          (message: StoredMessage) =>
            message.guardrail_variant !== "guarded" &&
            message.guardrail_variant !== "policy_2",
        ),
      );
    } finally {
      if (useCaseSession === useCaseSessionRef.current) {
        setIsRunning(false);
      }
    }
  }

  function replacePendingMessages(count: number, replacements: ChatMessage[]) {
    setMessages((current) => [...current.slice(0, -count), ...replacements]);
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
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-[#303033] dark:text-slate-50">
      <WorkspaceHeader
        navigation={{
          activeView,
          onOpenUseCases: () => {
            setActiveView("chat");
            setUseCaseMarketplaceOpen(true);
          },
          onOpenSettings: () => setActiveView("settings"),
          onOpenMetrics: () => setActiveView("metrics"),
        }}
        appearance={{
          theme: appearance.theme,
          onToggleTheme: appearance.toggleTheme,
        }}
        auth={{
          authenticated: auth?.authenticated === true,
          entraAuthEnabled,
          displayName: authDisplayName,
        }}
        trace={{
          entryCount: apiTrace.entries.length,
          onOpen: apiTrace.show,
          onClose: apiTrace.close,
        }}
        activity={{
          useCaseName: activeUseCaseDetails.shortTitle,
          status:
            realtimeStatus !== "idle"
              ? "Live"
              : traditionalVoiceStatus === "recording" ||
                  transcriptionStatus === "recording"
                ? "Recording"
                : null,
        }}
      />

      <ConversationHistoryPopover
        open={conversationsOpen}
        conversations={conversations}
        currentConversationId={currentConversationId}
        onClose={() => setConversationsOpen(false)}
        onNewChat={startNewChat}
        onLoad={loadConversation}
        onDelete={deleteConversationById}
      />

      <div
        className={cn(
          "grid h-[calc(100vh-3rem)] grid-cols-1 gap-4 p-4",
          !workspaceLocked && "lg:grid-cols-[18rem_minmax(0,1fr)]",
        )}
      >
        {!workspaceLocked ? (
          <WorkspaceSidebar
            workspace={{
              activeView,
              workspace: activeUseCaseDetails.workspace,
              showDocumentControls:
                activeUseCaseDetails.showDocumentControls === true,
              showBrowserVoiceControls:
                activeUseCaseDetails.showBrowserVoiceControls === true,
              showComparisonControls:
                activeUseCaseDetails.showComparisonControls === true,
              showImageComparisonControls:
                activeUseCaseDetails.showImageComparisonControls === true,
              canUseProtectedApis,
              conversationsOpen,
              config,
              onToggleConversations: () =>
                setConversationsOpen((open) => !open),
            }}
            models={{
              activeModel,
              catalogModels: models,
              textModels,
              transcriptionModels,
              transcriptionModel,
              onActiveModelChange: setActiveModel,
              onTranscriptionModelChange: setTranscriptionModel,
              onOpenSettings: modelSettingsController.open,
            }}
            documents={{
              documents: documentLibrary.documents,
              loading: documentLibrary.loading,
              message: documentLibrary.message,
              inputRef: documentLibrary.inputRef,
              onUpload: documentLibrary.upload,
              onRemove: documentLibrary.remove,
            }}
            browserSpeech={{
              availableSpeechVoices,
              isListening,
              selectedSpeechVoiceURI,
              selectedVoiceModel,
              speechRecognitionSupported,
              speechSynthesisSupported,
              voiceError,
              voiceReadbackEnabled,
              onVoiceModelChange: changeVoiceModel,
              onSpeechVoiceChange: setSelectedSpeechVoiceURI,
              onToggleDictation: toggleDictation,
              onToggleReadback: toggleReadback,
            }}
            comparison={{
              selectedModels,
              onToggleModel: toggleModel,
            }}
            images={{
              model: imageWorkspace.model,
              models: imageWorkspace.models,
              editModels: imageWorkspace.editModels,
              selectedModels: imageWorkspace.selectedModels,
              onModelChange: imageWorkspace.setModel,
              onToggleComparisonModel: imageWorkspace.toggleComparisonModel,
            }}
            guardrails={{
              enabled: guardrailComparison.enabled,
              isRunning,
              activePolicies: guardrailComparison.activePolicies,
              deploymentPolicyName:
                guardrailComparison.deploymentPolicy?.policy_name ?? undefined,
              error: guardrailComparison.error,
              onToggle: guardrailComparison.toggle,
            }}
            voice={{
              status: traditionalVoiceStatus,
              traditionalTranscriptionModels,
              traditionalTranscriptionModel,
              ttsModels,
              ttsModel,
              ttsVoice,
              onTraditionalTranscriptionModelChange:
                setTraditionalTranscriptionModel,
              onTtsModelChange: setTtsModel,
              onTtsVoiceChange: setTtsVoice,
            }}
          />
        ) : null}

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-white shadow-sm dark:border-[#55555a] dark:bg-[#39393d]">
          {!workspaceLocked ? (
            <div className="flex items-center justify-between border-b px-5 py-4 dark:border-[#55555a]">
              <div>
                <h2 className="palette-heading font-semibold">
                  {activeView === "metrics"
                    ? "Model metrics"
                    : activeView === "settings"
                      ? "Settings"
                      : activeView === "model-settings"
                        ? "Model settings"
                        : activeUseCaseDetails.title}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {activeView === "metrics"
                    ? "Usage and performance from saved local chat history"
                    : activeView === "settings"
                      ? "Appearance and application preferences"
                      : activeView === "model-settings"
                        ? `Configure ${modelSettingsController.settingsModel ?? activeModel}`
                        : activeUseCaseDetails.workspace === "image"
                          ? `Create a PNG with ${imageWorkspace.model || "an image deployment"}`
                          : activeUseCaseDetails.workspace === "imageEdit"
                            ? `Transform a source image with ${imageWorkspace.model || "a compatible image deployment"}`
                            : activeUseCaseDetails.workspace ===
                                "imageComparison"
                              ? `Comparing ${imageWorkspace.selected.length} image endpoint${imageWorkspace.selected.length === 1 ? "" : "s"}`
                              : activeUseCaseDetails.workspace === "comparison"
                                ? `Comparing ${selected.length} model endpoint${selected.length === 1 ? "" : "s"}`
                                : activeUseCase === "document_qa"
                                  ? `${documentLibrary.documents.length} indexed document${documentLibrary.documents.length === 1 ? "" : "s"} - active model: ${formatModelName(activeModel)}`
                                  : activeUseCaseDetails.workspace ===
                                        "traditionalVoice" ||
                                      activeUseCaseDetails.workspace ===
                                        "transcribe" ||
                                      activeUseCaseDetails.workspace ===
                                        "realtimeVoice" ||
                                      activeUseCaseDetails.workspace ===
                                        "voiceLive" ||
                                      activeUseCaseDetails.workspace ===
                                        "liveTranslation"
                                    ? activeUseCaseDetails.description
                                    : `${
                                        currentConversationId
                                          ? (conversations.find(
                                              (item) =>
                                                item.id ===
                                                currentConversationId,
                                            )?.title ?? "Saved chat")
                                          : "New unsaved chat"
                                      } - active model: ${formatModelName(activeModel)}`}
                </p>
              </div>
              <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                {activeView !== "model-settings" ? (
                  <button
                    type="button"
                    onClick={() =>
                      void modelSettingsController.open(
                        activeUseCaseDetails.workspace === "transcribe"
                          ? transcriptionModel
                          : activeUseCaseDetails.workspace === "image" ||
                              activeUseCaseDetails.workspace === "imageEdit" ||
                              activeUseCaseDetails.workspace ===
                                "imageComparison"
                            ? imageWorkspace.model
                            : activeModel,
                      )
                    }
                    className="rounded p-1 hover:bg-slate-100 dark:hover:bg-[#45454a]"
                    aria-label="Open active model settings"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                ) : null}
                <GitCompareArrows
                  className={cn(
                    "h-4 w-4",
                    comparisonMode
                      ? "text-violet-600 dark:text-violet-300"
                      : "text-slate-400",
                  )}
                />
                <button
                  type="button"
                  className="rounded p-1 text-violet-600 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-[#45454a]"
                  onClick={() => setUseCaseDetailsOpen(true)}
                  title={`Explain ${activeUseCaseDetails.title}`}
                  aria-label={`Explain ${activeUseCaseDetails.title}`}
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          {workspaceLocked ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="max-w-md text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-violet-500/15 dark:text-violet-200">
                  <LogIn className="h-7 w-7" />
                </div>
                <h2 className="text-2xl font-semibold">
                  {auth === null
                    ? "Checking access..."
                    : "Sign in to Foundry Demo"}
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {auth === null
                    ? "Confirming your Microsoft account session."
                    : "Use your Microsoft account to access chat, voice, document, and model comparison demos."}
                </p>
                {auth !== null ? (
                  <Button
                    type="button"
                    className="mt-6"
                    onClick={() => window.location.assign(loginUrl)}
                  >
                    <LogIn className="h-4 w-4" />
                    Sign in with Microsoft
                  </Button>
                ) : null}
              </div>
            </div>
          ) : activeView === "metrics" ? (
            <ModelMetricsDashboard
              models={models}
              metrics={metricsController.metrics}
              selectedModel={metricsController.model}
              days={metricsController.days}
              loading={metricsController.loading}
              error={metricsController.error}
              onModelChange={metricsController.setModel}
              onDaysChange={metricsController.setDays}
              onRefresh={() => void metricsController.refresh()}
            />
          ) : activeView === "settings" ? (
            <AppSettingsPage
              models={models}
              modelModalities={modelModalities}
              newModel={newModel}
              message={modelEndpointMessage}
              colorPalette={appearance.colorPalette}
              canManageModels={canUseProtectedApis}
              onNewModelChange={setNewModel}
              onAddModel={() => void addModel()}
              onOpenAdmin={() => void adminDeployment.open()}
              onSaveCapabilities={modelSettingsController.saveModelCapabilities}
              onColorPaletteChange={appearance.setColorPalette}
            />
          ) : activeView === "model-settings" &&
            modelSettingsController.settingsModel ? (
            <ModelSettingsPage
              model={modelSettingsController.settingsModel}
              draft={modelSettingsController.draft}
              saving={modelSettingsController.saving}
              policies={modelSettingsController.policies}
              deploymentPolicy={modelSettingsController.deploymentPolicy}
              policiesLoading={modelSettingsController.policiesLoading}
              error={modelSettingsController.error}
              onClose={() => {
                modelSettingsController.close();
                setActiveView("chat");
              }}
              onSave={() => void modelSettingsController.save()}
              onReset={modelSettingsController.resetDraft}
              onChange={modelSettingsController.changeDraft}
            />
          ) : activeUseCaseDetails.workspace === "image" ? (
            <TextToImageWorkspace
              model={imageWorkspace.model}
              models={imageWorkspace.models}
              prompt={imageWorkspace.prompt}
              size={imageWorkspace.size}
              result={imageWorkspace.result}
              generating={imageWorkspace.generating}
              error={imageWorkspace.error}
              onPromptChange={imageWorkspace.setPrompt}
              onSizeChange={imageWorkspace.setSize}
              onModelChange={imageWorkspace.setModel}
              onGenerate={() => void imageWorkspace.runGeneration()}
            />
          ) : activeUseCaseDetails.workspace === "imageEdit" ? (
            <ImageToImageWorkspace
              model={imageWorkspace.model}
              models={imageWorkspace.editModels}
              prompt={imageWorkspace.prompt}
              size={imageWorkspace.size}
              source={imageWorkspace.editSource}
              result={imageWorkspace.editResult}
              generating={imageWorkspace.editGenerating}
              error={imageWorkspace.editError}
              onPromptChange={imageWorkspace.setPrompt}
              onSizeChange={imageWorkspace.setSize}
              onSourceChange={imageWorkspace.setEditSource}
              onModelChange={imageWorkspace.setModel}
              onGenerate={() => void imageWorkspace.runEdit()}
            />
          ) : activeUseCaseDetails.workspace === "imageComparison" ? (
            <ImageComparisonWorkspace
              allModels={imageWorkspace.models}
              models={imageWorkspace.selected}
              prompt={imageWorkspace.prompt}
              size={imageWorkspace.size}
              results={imageWorkspace.comparisonResults}
              errors={imageWorkspace.comparisonErrors}
              generating={imageWorkspace.comparisonGenerating}
              onPromptChange={imageWorkspace.setPrompt}
              onSizeChange={imageWorkspace.setSize}
              onGenerate={() => void imageWorkspace.runComparison()}
              onOpenSettings={(model) =>
                void modelSettingsController.open(model)
              }
              onModelChange={imageWorkspace.replaceComparisonModel}
            />
          ) : activeUseCaseDetails.workspace === "comparison" ? (
            <ComparisonWorkspace
              allModels={textModels}
              models={selected}
              messages={messages}
              prompt={prompt}
              isRunning={isRunning}
              canSubmit={canSubmit}
              speechRecognitionSupported={false}
              isListening={false}
              onPromptChange={setPrompt}
              onSubmit={() => void runComparison()}
              onToggleDictation={toggleDictation}
              onOpenSettings={(model) =>
                void modelSettingsController.open(model)
              }
              onModelChange={replaceComparisonModel}
            />
          ) : activeUseCaseDetails.workspace === "traditionalVoice" ? (
            <TraditionalVoiceWorkspace
              configured={config?.is_traditional_voice_configured ?? false}
              activeModel={activeModel}
              chatModels={textModels}
              onChatModelChange={setActiveModel}
              transcriptionModels={traditionalTranscriptionModels}
              transcriptionModel={traditionalTranscriptionModel}
              onTranscriptionModelChange={setTraditionalTranscriptionModel}
              ttsModels={ttsModels}
              ttsModel={ttsModel}
              onTtsModelChange={setTtsModel}
              ttsVoice={ttsVoice}
              ttsVoices={traditionalTtsVoices}
              onTtsVoiceChange={setTtsVoice}
              status={traditionalVoiceStatus}
              error={traditionalVoiceError}
              result={traditionalVoiceResult}
              onStart={() =>
                void startTraditionalVoiceSession({
                  models: textModels,
                  prompt,
                  activeModel,
                  conversation:
                    conversations.find(
                      (conversation) =>
                        conversation.id === currentConversationId,
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
                })
              }
              onStop={stopTraditionalRecording}
            />
          ) : activeUseCaseDetails.workspace === "transcribe" ? (
            <TranscriptionWorkspace
              configured={
                transcriptionModel.toLowerCase().startsWith("mai-transcribe")
                  ? (config?.is_speech_transcription_configured ?? false)
                  : (config?.is_configured ?? false)
              }
              model={transcriptionModel}
              status={transcriptionStatus}
              error={transcriptionError}
              result={transcriptionResult}
              language={transcriptionLanguage}
              sourceName={transcriptionSourceName}
              audioUrl={transcriptionAudioUrl}
              fileInputRef={transcriptionFileInputRef}
              onLanguageChange={setTranscriptionLanguage}
              onStart={() => void startTranscriptionRecording()}
              onStop={stopTranscriptionRecording}
              onFileSelected={(file) => void selectTranscriptionFile(file)}
            />
          ) : activeUseCaseDetails.workspace === "realtimeVoice" ? (
            <div className="flex-1 overflow-auto p-5">
              <div className="mx-auto flex min-h-full max-w-4xl items-center justify-center">
                <RealtimeVoiceHero
                  configured={config?.is_realtime_configured ?? false}
                  model={
                    realtimeSessionModel ??
                    config?.realtime_model ??
                    "gpt-realtime-2.1"
                  }
                  status={realtimeStatus}
                  error={realtimeError}
                  guardrailStatus={realtimeGuardrailStatus}
                  transcript={realtimeTranscript}
                  onStart={() => void startRealtimeSession()}
                  onStop={stopRealtimeSession}
                />
              </div>
            </div>
          ) : activeUseCaseDetails.workspace === "voiceLive" ? (
            <div className="flex-1 overflow-auto p-5">
              <div className="mx-auto flex min-h-full max-w-4xl items-center justify-center">
                <VoiceLiveHero
                  configured={config?.is_voice_live_configured ?? false}
                  model={config?.voice_live_model ?? "gpt-realtime"}
                  voice={
                    config?.voice_live_voice ?? "en-US-Ava:DragonHDLatestNeural"
                  }
                  status={voiceLiveStatus}
                  error={voiceLiveError}
                  transcript={voiceLiveTranscript}
                  onStart={() => void startVoiceLiveSession()}
                  onStop={stopVoiceLiveSession}
                />
              </div>
            </div>
          ) : activeUseCaseDetails.workspace === "liveTranslation" ? (
            <div className="flex-1 overflow-auto p-5">
              <div className="mx-auto flex min-h-full max-w-4xl items-center justify-center">
                <LiveTranslationHero
                  configured={config?.is_live_interpreter_configured ?? false}
                  status={liveTranslationStatus}
                  error={liveTranslationError}
                  targetLanguage={liveTranslationTarget}
                  transcript={liveTranslationTranscript}
                  onTargetLanguageChange={setLiveTranslationTarget}
                  onStart={() => void startLiveTranslationSession()}
                  onStop={stopLiveTranslationSession}
                />
              </div>
            </div>
          ) : guardrailComparison.enabled &&
            activeUseCaseDetails.workspace === "chat" ? (
            <GuardrailComparisonWorkspace
              model={activeModel}
              policyNames={guardrailComparison.activePolicies}
              deploymentPolicyName={
                guardrailComparison.deploymentPolicy?.policy_name
              }
              messages={messages}
              prompt={prompt}
              isRunning={isRunning}
              canSubmit={canSubmit}
              onPromptChange={setPrompt}
              onSubmit={() =>
                activeUseCase === "document_qa"
                  ? void runDocumentChat()
                  : void runChat()
              }
              onOpenSettings={() =>
                void modelSettingsController.open(activeModel)
              }
            />
          ) : (
            <>
              <div className="flex-1 overflow-auto p-5">
                {messages.length ? (
                  <div className="mx-auto grid max-w-5xl gap-4">
                    <ChatMessageHistory messages={messages} />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <ChatEmptyState
                      useCase={activeUseCase}
                      activeModel={activeModel}
                      onOpenUseCases={() => setUseCaseMarketplaceOpen(true)}
                    />
                  </div>
                )}
              </div>

              <UseCaseComposer
                ariaLabel="Chat prompt"
                placeholder="Ask anything..."
                value={prompt}
                disabled={!canSubmit}
                submitting={isRunning}
                disclaimer="AI-generated content may be incorrect"
                onChange={setPrompt}
                onSubmit={() => {
                  if (activeUseCase === "document_qa") {
                    void runDocumentChat();
                  } else {
                    void runChat();
                  }
                }}
                leftControls={
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={!activeModel || !canUseProtectedApis}
                      onClick={() =>
                        void modelSettingsController.open(activeModel)
                      }
                      title="Open active model settings"
                      className="h-8 w-8 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-[#3b3b40] dark:hover:text-slate-100"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <ComposerSelect
                      id="composer-model"
                      ariaLabel="Composer model"
                      value={activeModel}
                      onChange={setActiveModel}
                      options={textModels.map((model) => ({
                        value: model,
                        label: formatModelName(model),
                      }))}
                    />
                    {activeUseCase === "document_qa" ? (
                      <span className="rounded-full px-2 py-1 text-sm text-slate-700 dark:text-slate-200">
                        Document RAG
                      </span>
                    ) : null}
                  </>
                }
                rightControls={
                  <>
                    {activeUseCaseDetails.enableComposerDictation ? (
                      <>
                        <InfinityIcon
                          className="h-4 w-4 text-slate-500 dark:text-slate-400"
                          aria-hidden="true"
                        />
                        <Button
                          type="button"
                          variant={isListening ? "destructive" : "ghost"}
                          size="icon"
                          disabled={!speechRecognitionSupported}
                          onClick={toggleDictation}
                          title={
                            isListening
                              ? "Stop browser dictation"
                              : "Start browser dictation (speech-to-text into the prompt)"
                          }
                          className={cn(
                            "h-8 w-8 rounded-full",
                            !isListening &&
                              "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-[#3b3b40] dark:hover:text-slate-100",
                          )}
                        >
                          {isListening ? (
                            <MicOff className="h-4 w-4" />
                          ) : (
                            <Mic className="h-4 w-4" />
                          )}
                        </Button>
                      </>
                    ) : null}
                    <ComposerSelect
                      id="composer-reasoning"
                      ariaLabel="Reasoning level"
                      value={reasoningEffort}
                      onChange={(value) =>
                        setReasoningEffort(value as ReasoningEffort)
                      }
                      options={reasoningEffortOptions}
                      title="Reasoning effort is sent to Responses API reasoning-capable deployments."
                    />
                  </>
                }
              />
            </>
          )}
        </section>
      </div>

      {adminDeployment.isOpen ? (
        <AdminDeploymentModal
          config={adminDeployment.config}
          draft={adminDeployment.deploymentDraft}
          deploying={adminDeployment.isDeploying}
          message={adminDeployment.message}
          onClose={adminDeployment.close}
          onCreate={() => void adminDeployment.createDeployment()}
          onChange={adminDeployment.updateDeploymentDraft}
        />
      ) : null}

      {useCaseMarketplaceOpen ? (
        <UseCaseMarketplace
          activeUseCase={activeUseCase}
          useCases={useCaseModules}
          onSelect={selectUseCase}
          onClose={() => setUseCaseMarketplaceOpen(false)}
        />
      ) : null}

      {useCaseDetailsOpen ? (
        <UseCaseDetailsPanel
          useCase={activeUseCaseDetails}
          onClose={() => setUseCaseDetailsOpen(false)}
        />
      ) : null}

      <ApiTraceDrawer
        open={apiTrace.open}
        entries={apiTrace.entries}
        filter={apiTrace.filter}
        onClose={apiTrace.close}
        onClear={apiTrace.clear}
        onFilterChange={apiTrace.setFilter}
      />

      <Toaster
        theme={appearance.theme}
        position="bottom-right"
        richColors
        closeButton
      />
    </main>
  );
}
