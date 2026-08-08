import { GitCompareArrows, HelpCircle, Settings } from "lucide-react";
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
import {
  deploymentDefaultGuardrail,
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
import { useApiTrace } from "@/app/workspace/useApiTrace";
import { useWorkspaceAppearance } from "@/app/workspace/useWorkspaceAppearance";
import {
  WorkspaceContentRouter,
  type WorkspaceContentRouterProps,
} from "@/app/workspace/WorkspaceContentRouter";
import { WorkspaceHeader } from "@/app/workspace/WorkspaceHeader";
import { WorkspaceSidebar } from "@/app/workspace/WorkspaceSidebar";
import { Toaster } from "@/components/ui/sonner";
import { useAdminDeployment } from "@/features/admin/useAdminDeployment";
import { compareModels, comparisonEndpoint } from "@/features/comparison/api";
import { documentAnswerStreamEndpoint } from "@/features/documentQa/api";
import { useDocumentLibrary } from "@/features/documentQa/useDocumentLibrary";
import { useGuardrailComparison } from "@/features/guardrails/useGuardrailComparison";
import { useImageWorkspace } from "@/features/images/useImageWorkspace";
import { UseCaseMarketplace } from "@/features/marketplace/UseCaseMarketplace";
import { useModelMetrics } from "@/features/metrics/useModelMetrics";
import { useModelCatalog } from "@/features/models/useModelCatalog";
import { useModelSettingsController } from "@/features/models/useModelSettingsController";
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
import { cn } from "@/lib/utils";

import { useAppBootstrap } from "./useAppBootstrap";

export default function AppWorkspace() {
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
  const realtime = useRealtimeVoice({
    fetchClient: apiTrace.tracedFetch,
    model: config?.realtime_model ?? "gpt-realtime-2.1",
  });
  const voiceLive = useVoiceLive({
    model: config?.voice_live_model ?? "gpt-realtime",
    voice: config?.voice_live_voice ?? "en-US-Ava:DragonHDLatestNeural",
  });
  const liveTranslation = useLiveTranslation();
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
      realtime.status !== "idle"
    ) {
      realtime.stop();
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
  const contentRouterProps: WorkspaceContentRouterProps = {
    route: {
      view: activeView,
      workspace: activeUseCaseDetails.workspace,
      useCase: activeUseCase,
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
        onNewModelChange: setNewModel,
        onAddModel: () => void addModel(),
        onOpenAdmin: () => void adminDeployment.open(),
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
        targetLanguage: liveTranslation.targetLanguage,
        transcript: liveTranslation.transcript,
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
  };
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
            realtime.status !== "idle"
              ? "Live"
              : traditionalVoice.status === "recording" ||
                  transcription.status === "recording"
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
              showEnableComparison:
                activeUseCase === "text_chat" ||
                activeUseCase === "text_to_image",
              canUseProtectedApis,
              conversationsOpen,
              config,
              onToggleConversations: () =>
                setConversationsOpen((open) => !open),
              onEnableComparison: () =>
                selectUseCase(
                  activeUseCase === "text_to_image"
                    ? "image_comparison"
                    : "comparison",
                ),
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
              status: traditionalVoice.status,
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

          <WorkspaceContentRouter {...contentRouterProps} />
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
