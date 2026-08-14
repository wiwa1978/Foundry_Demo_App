import { GitCompareArrows, HelpCircle, Settings } from "lucide-react";

import { ApiUnavailableDialog } from "@/app/ApiUnavailableDialog";
import { useCaseModules } from "@/app/useCaseRegistry";
import { AdminDeploymentModal } from "@/app/workspace/AdminDeploymentModal";
import { ApiTraceDrawer } from "@/app/workspace/ApiTraceDrawer";
import type { ViewMode } from "@/app/workspace/contracts";
import { ConversationHistoryPopover } from "@/app/workspace/ConversationHistoryPopover";
import { formatModelName } from "@/app/workspace/formatters";
import { WorkspaceContentRouter } from "@/app/workspace/WorkspaceContentRouter";
import { WorkspaceHeader } from "@/app/workspace/WorkspaceHeader";
import { WorkspaceSidebar } from "@/app/workspace/WorkspaceSidebar";
import { Toaster } from "@/components/ui/sonner";
import { UseCaseMarketplace } from "@/features/marketplace/UseCaseMarketplace";
import { UseCaseDetailsPanel } from "@/features/useCases/UseCaseDetailsPanel";
import { cn } from "@/lib/utils";

import { useWorkspaceController } from "./useWorkspaceController";


function isAdminView(view: ViewMode) {
  return view === "evaluation-admin" || view === "admin-monitor";
}

export default function AppWorkspace() {

  const {
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
    apiUnavailable,
    apiUnavailableReason,
    retryApiConnection,
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
    liveTranslation,
    selected,
    selectedTranscriptions,
    contentRouterProps,
    adminDeployment,
  } = useWorkspaceController();
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
          onOpenMetrics: () => setActiveView("admin-monitor"),
          onOpenEvaluationsAdmin: () => setActiveView("evaluation-admin"),
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
          !workspaceLocked &&
            !isAdminView(activeView) &&
            "lg:grid-cols-[18rem_minmax(0,1fr)]",
        )}
      >
        {!workspaceLocked && !isAdminView(activeView) ? (
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
              showTranscriptionComparisonControls:
                activeUseCaseDetails.showTranscriptionComparisonControls ===
                true,
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
            contentExtractor={{
              configured: config?.is_content_extractor_configured ?? false,
              mode: contentExtractor.mode,
              file: contentExtractor.file,
              loading: contentExtractor.loading,
              error: contentExtractor.error,
              samples: contentExtractor.samples,
              samplesLoading: contentExtractor.samplesLoading,
              sampleError: contentExtractor.sampleError,
              inputRef: contentExtractorFileInputRef,
              onModeChange: contentExtractor.setMode,
              onFileChange: (file) => void contentExtractor.extractFile(file),
              onSelectSample: (sample) => void contentExtractor.selectSample(sample),
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
              selectedTranscriptionModels,
              onToggleTranscriptionModel: toggleTranscriptionModel,
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
          {!workspaceLocked && !isAdminView(activeView) && activeUseCaseDetails.workspace !== "contentExtractor" ? (
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
                                : activeUseCaseDetails.workspace ===
                                      "agentResearch" ||
                                    activeUseCaseDetails.workspace ===
                                      "hostedAgent"
                                  ? activeUseCaseDetails.description
                                  : activeUseCaseDetails.workspace ===
                                      "transcriptionComparison"
                                    ? `Comparing ${selectedTranscriptions.length} transcription endpoint${selectedTranscriptions.length === 1 ? "" : "s"}`
                                    : activeUseCase === "document_qa"
                                      ? `${documentLibrary.documents.length} indexed document${documentLibrary.documents.length === 1 ? "" : "s"} - active model: ${formatModelName(activeModel)}`
                                      : activeUseCaseDetails.workspace ===
                                            "traditionalVoice" ||
                                          activeUseCaseDetails.workspace ===
                                            "transcribe" ||
                                          activeUseCaseDetails.workspace ===
                                            "realtimeVoice" ||
                                          activeUseCaseDetails.workspace ===
                                            "realtimeTranscriptionWebRtc" ||
                                          activeUseCaseDetails.workspace ===
                                            "realtimeTranscriptionWebSocket" ||
                                          activeUseCaseDetails.workspace ===
                                            "realtimeTranslationWebSocket" ||
                                          activeUseCaseDetails.workspace ===
                                            "voiceLive" ||
                                          activeUseCaseDetails.workspace ===
                                            "liveTranslation" ||
                                          activeUseCaseDetails.workspace ===
                                            "youtubeSummary"
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
                {activeView !== "model-settings" &&
                activeUseCaseDetails.workspace !==
                  "realtimeTranslationWebRtc" &&
                activeUseCaseDetails.workspace !==
                  "realtimeTranslationWebSocket" &&
                activeUseCaseDetails.workspace !== "liveTranslation" ? (
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
      {apiUnavailable ? (
        <ApiUnavailableDialog
          reason={apiUnavailableReason}
          onRetry={retryApiConnection}
        />
      ) : null}

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
