import {
  Infinity as InfinityIcon,
  LogIn,
  Mic,
  MicOff,
  Plus,
} from "lucide-react";
import type { RefObject } from "react";

import type { UseCaseId, UseCaseWorkspace } from "@/app/types";
import { AppSettingsPage } from "@/app/workspace/AppSettingsPage";
import { reasoningEffortOptions } from "@/app/workspace/constants";
import type {
  ColorPalette,
  DeploymentGuardrailPolicy,
  GuardrailPolicy,
  ImageGenerationResult,
  ModelMetrics,
  ModelModality,
  ModelSettings,
  RealtimeStatus,
  RealtimeTranscriptEntry,
  StatusMessage,
  TraditionalVoiceResult,
  TraditionalVoiceStatus,
  TranscriptionResult,
  ViewMode,
} from "@/app/workspace/contracts";
import { formatModelName } from "@/app/workspace/formatters";
import { ModelMetricsDashboard } from "@/app/workspace/ModelMetricsDashboard";
import { ModelSettingsPage } from "@/app/workspace/ModelSettingsPage";
import {
  ChatEmptyState,
  ComposerSelect,
  UseCaseComposer,
} from "@/app/workspace/WorkspacePrimitives";
import { Button } from "@/components/ui/button";
import { ComparisonWorkspace } from "@/features/comparison/ComparisonWorkspace";
import { GuardrailComparisonWorkspace } from "@/features/guardrails/GuardrailWorkspaces";
import {
  ImageComparisonWorkspace,
  ImageToImageWorkspace,
  TextToImageWorkspace,
} from "@/features/images/ImageWorkspaces";
import { ChatMessageHistory } from "@/features/textChat/ChatMessages";
import type { ChatMessage, ReasoningEffort } from "@/features/textChat/types";
import type { TraditionalVoiceRequest } from "@/features/voice/useTraditionalVoiceSession";
import {
  LiveTranslationHero,
  RealtimeVoiceHero,
  TraditionalVoiceWorkspace,
  TranscriptionWorkspace,
  VoiceLiveHero,
} from "@/features/voice/VoiceWorkspaces";
import { cn } from "@/lib/utils";

export type WorkspaceContentRoute = {
  view: ViewMode;
  workspace: UseCaseWorkspace;
  useCase: UseCaseId;
  enableComposerDictation: boolean;
};

export type WorkspaceAccessViewModel = {
  locked: boolean;
  checking: boolean;
  canUseProtectedApis: boolean;
  onSignIn: () => void;
};

export type WorkspaceMetricsViewModel = {
  models: string[];
  metrics: ModelMetrics | null;
  model: string;
  days: number;
  loading: boolean;
  error: string;
  setModel: (model: string) => void;
  setDays: (days: number) => void;
  refresh: () => Promise<void>;
};

export type WorkspaceAppSettingsViewModel = {
  models: string[];
  modelModalities: Record<string, ModelModality[]>;
  newModel: string;
  message: StatusMessage | null;
  colorPalette: ColorPalette;
  canManageModels: boolean;
  onNewModelChange: (value: string) => void;
  onAddModel: () => void;
  onOpenAdmin: () => void;
  onSaveCapabilities: (
    model: string,
    modalities: ModelModality[],
  ) => Promise<void>;
  onColorPaletteChange: (palette: ColorPalette) => void;
};

export type WorkspaceModelSettingsViewModel = {
  settingsModel: string | null;
  draft: ModelSettings | null;
  saving: boolean;
  policies: GuardrailPolicy[];
  deploymentPolicy: DeploymentGuardrailPolicy | null;
  policiesLoading: boolean;
  error: string;
  onClose: () => void;
  save: () => Promise<void>;
  resetDraft: () => void;
  changeDraft: (patch: Partial<ModelSettings>) => void;
};

export type WorkspaceSettingsViewModel = {
  app: WorkspaceAppSettingsViewModel;
  model: WorkspaceModelSettingsViewModel;
};

export type WorkspaceImagesViewModel = {
  model: string;
  models: string[];
  editModels: string[];
  selected: string[];
  prompt: string;
  submittedPrompt: string;
  size: string;
  result: ImageGenerationResult | null;
  generating: boolean;
  error: string;
  editSource: File | null;
  editResult: ImageGenerationResult | null;
  editGenerating: boolean;
  editError: string;
  comparisonResults: Record<string, ImageGenerationResult>;
  comparisonErrors: Record<string, string>;
  comparisonGenerating: boolean;
  setPrompt: (prompt: string) => void;
  setSize: (size: string) => void;
  setEditSource: (source: File | null) => void;
  setModel: (model: string) => void;
  runGeneration: () => Promise<void>;
  runEdit: () => Promise<void>;
  runComparison: () => Promise<void>;
  onOpenSettings: (model: string) => void;
  replaceComparisonModel: (currentModel: string, nextModel: string) => void;
};

export type WorkspaceComparisonViewModel = {
  allModels: string[];
  models: string[];
  messages: ChatMessage[];
  prompt: string;
  isRunning: boolean;
  canSubmit: boolean;
  reasoningEffort: ReasoningEffort;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onToggleDictation: () => void;
  onOpenSettings: (model: string) => void;
  onModelChange: (currentModel: string, nextModel: string) => void;
  onReasoningEffortChange: (effort: ReasoningEffort) => void;
};

export type WorkspaceTraditionalVoiceViewModel = {
  configured: boolean;
  activeModel: string;
  chatModels: string[];
  transcriptionModels: string[];
  transcriptionModel: string;
  ttsModels: string[];
  ttsModel: string;
  ttsVoice: string;
  ttsVoices: string[];
  status: TraditionalVoiceStatus;
  error: string;
  result: TraditionalVoiceResult | null;
  request: TraditionalVoiceRequest;
  onChatModelChange: (model: string) => void;
  onTranscriptionModelChange: (model: string) => void;
  onTtsModelChange: (model: string) => void;
  onTtsVoiceChange: (voice: string) => void;
  onStart: (request: TraditionalVoiceRequest) => void;
  onStop: () => void;
};

export type WorkspaceTranscriptionViewModel = {
  configured: boolean;
  model: string;
  status: TraditionalVoiceStatus;
  error: string;
  result: TranscriptionResult | null;
  language: string;
  sourceName: string;
  audioUrl: string;
  fileInputRef: RefObject<HTMLInputElement>;
  onLanguageChange: (value: string) => void;
  onStart: () => void;
  onStop: () => void;
  onFileSelected: (file: File | undefined) => void;
};

export type WorkspaceRealtimeSessionViewModel = {
  configured: boolean;
  model: string;
  status: RealtimeStatus;
  error: string;
  guardrailStatus: string;
  transcript: RealtimeTranscriptEntry[];
  onStart: () => void;
  onStop: () => void;
};

export type WorkspaceVoiceLiveViewModel = {
  configured: boolean;
  model: string;
  voice: string;
  status: RealtimeStatus;
  error: string;
  transcript: RealtimeTranscriptEntry[];
  onStart: () => void;
  onStop: () => void;
};

export type WorkspaceLiveTranslationViewModel = {
  configured: boolean;
  status: RealtimeStatus;
  error: string;
  targetLanguage: string;
  transcript: RealtimeTranscriptEntry[];
  onTargetLanguageChange: (language: string) => void;
  onStart: () => void;
  onStop: () => void;
};

export type WorkspaceRealtimeViewModel = {
  session: WorkspaceRealtimeSessionViewModel;
  voiceLive: WorkspaceVoiceLiveViewModel;
  liveTranslation: WorkspaceLiveTranslationViewModel;
};

export type WorkspaceGuardrailsViewModel = {
  enabled: boolean;
  policyNames: string[];
  deploymentPolicyName?: string | null;
};

export type WorkspaceChatViewModel = {
  activeModel: string;
  models: string[];
  messages: ChatMessage[];
  prompt: string;
  isRunning: boolean;
  canSubmit: boolean;
  isListening: boolean;
  speechRecognitionSupported: boolean;
  reasoningEffort: ReasoningEffort;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onDocumentSubmit: () => void;
  onOpenSettings: (model: string) => void;
  onActiveModelChange: (model: string) => void;
  onToggleDictation: () => void;
  onReasoningEffortChange: (effort: ReasoningEffort) => void;
  onOpenUseCases: () => void;
};

export type WorkspaceContentRouterProps = {
  route: WorkspaceContentRoute;
  access: WorkspaceAccessViewModel;
  metrics: WorkspaceMetricsViewModel;
  settings: WorkspaceSettingsViewModel;
  images: WorkspaceImagesViewModel;
  comparison: WorkspaceComparisonViewModel;
  traditionalVoice: WorkspaceTraditionalVoiceViewModel;
  transcription: WorkspaceTranscriptionViewModel;
  realtime: WorkspaceRealtimeViewModel;
  guardrails: WorkspaceGuardrailsViewModel;
  chat: WorkspaceChatViewModel;
};

export function WorkspaceContentRouter({
  route,
  access,
  metrics,
  settings,
  images,
  comparison,
  traditionalVoice,
  transcription,
  realtime,
  guardrails,
  chat,
}: WorkspaceContentRouterProps) {
  if (access.locked) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-violet-500/15 dark:text-violet-200">
            <LogIn className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-semibold">
            {access.checking ? "Checking access..." : "Sign in to Foundry Demo"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {access.checking
              ? "Confirming your Microsoft account session."
              : "Use your Microsoft account to access chat, voice, document, and model comparison demos."}
          </p>
          {!access.checking ? (
            <Button type="button" className="mt-6" onClick={access.onSignIn}>
              <LogIn className="h-4 w-4" />
              Sign in with Microsoft
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (route.view === "metrics") {
    return (
      <ModelMetricsDashboard
        models={metrics.models}
        metrics={metrics.metrics}
        selectedModel={metrics.model}
        days={metrics.days}
        loading={metrics.loading}
        error={metrics.error}
        onModelChange={metrics.setModel}
        onDaysChange={metrics.setDays}
        onRefresh={() => void metrics.refresh()}
      />
    );
  }

  if (route.view === "settings") {
    return <AppSettingsPage {...settings.app} />;
  }

  if (route.view === "model-settings" && settings.model.settingsModel) {
    return (
      <ModelSettingsPage
        model={settings.model.settingsModel}
        draft={settings.model.draft}
        saving={settings.model.saving}
        policies={settings.model.policies}
        deploymentPolicy={settings.model.deploymentPolicy}
        policiesLoading={settings.model.policiesLoading}
        error={settings.model.error}
        onClose={settings.model.onClose}
        onSave={() => void settings.model.save()}
        onReset={settings.model.resetDraft}
        onChange={settings.model.changeDraft}
      />
    );
  }

  if (route.workspace === "image") {
    return (
      <TextToImageWorkspace
        model={images.model}
        models={images.models}
        prompt={images.prompt}
        submittedPrompt={images.submittedPrompt}
        size={images.size}
        result={images.result}
        generating={images.generating}
        error={images.error}
        onPromptChange={images.setPrompt}
        onSizeChange={images.setSize}
        onModelChange={images.setModel}
        onGenerate={() => void images.runGeneration()}
      />
    );
  }

  if (route.workspace === "imageEdit") {
    return (
      <ImageToImageWorkspace
        model={images.model}
        models={images.editModels}
        prompt={images.prompt}
        size={images.size}
        source={images.editSource}
        result={images.editResult}
        generating={images.editGenerating}
        error={images.editError}
        onPromptChange={images.setPrompt}
        onSizeChange={images.setSize}
        onSourceChange={images.setEditSource}
        onModelChange={images.setModel}
        onGenerate={() => void images.runEdit()}
      />
    );
  }

  if (route.workspace === "imageComparison") {
    return (
      <ImageComparisonWorkspace
        allModels={images.models}
        models={images.selected}
        prompt={images.prompt}
        size={images.size}
        results={images.comparisonResults}
        errors={images.comparisonErrors}
        generating={images.comparisonGenerating}
        onPromptChange={images.setPrompt}
        onSizeChange={images.setSize}
        onGenerate={() => void images.runComparison()}
        onOpenSettings={images.onOpenSettings}
        onModelChange={images.replaceComparisonModel}
      />
    );
  }

  if (route.workspace === "comparison") {
    return (
      <ComparisonWorkspace
        {...comparison}
        speechRecognitionSupported={false}
        isListening={false}
      />
    );
  }

  if (route.workspace === "traditionalVoice") {
    return (
      <TraditionalVoiceWorkspace
        configured={traditionalVoice.configured}
        activeModel={traditionalVoice.activeModel}
        chatModels={traditionalVoice.chatModels}
        onChatModelChange={traditionalVoice.onChatModelChange}
        transcriptionModels={traditionalVoice.transcriptionModels}
        transcriptionModel={traditionalVoice.transcriptionModel}
        onTranscriptionModelChange={traditionalVoice.onTranscriptionModelChange}
        ttsModels={traditionalVoice.ttsModels}
        ttsModel={traditionalVoice.ttsModel}
        onTtsModelChange={traditionalVoice.onTtsModelChange}
        ttsVoice={traditionalVoice.ttsVoice}
        ttsVoices={traditionalVoice.ttsVoices}
        onTtsVoiceChange={traditionalVoice.onTtsVoiceChange}
        status={traditionalVoice.status}
        error={traditionalVoice.error}
        result={traditionalVoice.result}
        onStart={() => traditionalVoice.onStart(traditionalVoice.request)}
        onStop={traditionalVoice.onStop}
      />
    );
  }

  if (route.workspace === "transcribe") {
    return <TranscriptionWorkspace {...transcription} />;
  }

  if (route.workspace === "realtimeVoice") {
    return (
      <div className="flex-1 overflow-auto p-5">
        <div className="mx-auto flex min-h-full max-w-4xl items-center justify-center">
          <RealtimeVoiceHero {...realtime.session} />
        </div>
      </div>
    );
  }

  if (route.workspace === "voiceLive") {
    return (
      <div className="flex-1 overflow-auto p-5">
        <div className="mx-auto flex min-h-full max-w-4xl items-center justify-center">
          <VoiceLiveHero {...realtime.voiceLive} />
        </div>
      </div>
    );
  }

  if (route.workspace === "liveTranslation") {
    return (
      <div className="flex-1 overflow-auto p-5">
        <div className="mx-auto flex min-h-full max-w-4xl items-center justify-center">
          <LiveTranslationHero {...realtime.liveTranslation} />
        </div>
      </div>
    );
  }

  if (guardrails.enabled && route.workspace === "chat") {
    return (
      <GuardrailComparisonWorkspace
        model={chat.activeModel}
        policyNames={guardrails.policyNames}
        deploymentPolicyName={guardrails.deploymentPolicyName}
        messages={chat.messages}
        prompt={chat.prompt}
        isRunning={chat.isRunning}
        canSubmit={chat.canSubmit}
        onPromptChange={chat.onPromptChange}
        onSubmit={
          route.useCase === "document_qa"
            ? chat.onDocumentSubmit
            : chat.onSubmit
        }
        onOpenSettings={() => chat.onOpenSettings(chat.activeModel)}
      />
    );
  }

  return (
    <>
      <div className="flex-1 overflow-auto p-5">
        {chat.messages.length ? (
          <div className="mx-auto grid max-w-5xl gap-4">
            <ChatMessageHistory messages={chat.messages} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <ChatEmptyState
              useCase={route.useCase}
              activeModel={chat.activeModel}
              onOpenUseCases={chat.onOpenUseCases}
            />
          </div>
        )}
      </div>

      <UseCaseComposer
        ariaLabel="Chat prompt"
        placeholder="Ask anything..."
        value={chat.prompt}
        disabled={!chat.canSubmit}
        submitting={chat.isRunning}
        disclaimer="AI-generated content may be incorrect"
        onChange={chat.onPromptChange}
        onSubmit={
          route.useCase === "document_qa"
            ? chat.onDocumentSubmit
            : chat.onSubmit
        }
        leftControls={
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={!chat.activeModel || !access.canUseProtectedApis}
              onClick={() => chat.onOpenSettings(chat.activeModel)}
              title="Open active model settings"
              className="h-8 w-8 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-[#3b3b40] dark:hover:text-slate-100"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <ComposerSelect
              id="composer-model"
              ariaLabel="Composer model"
              value={chat.activeModel}
              onChange={chat.onActiveModelChange}
              options={chat.models.map((model) => ({
                value: model,
                label: formatModelName(model),
              }))}
            />
            {route.useCase === "document_qa" ? (
              <span className="rounded-full px-2 py-1 text-sm text-slate-700 dark:text-slate-200">
                Document RAG
              </span>
            ) : null}
          </>
        }
        rightControls={
          <>
            {route.enableComposerDictation ? (
              <>
                <InfinityIcon
                  className="h-4 w-4 text-slate-500 dark:text-slate-400"
                  aria-hidden="true"
                />
                <Button
                  type="button"
                  variant={chat.isListening ? "destructive" : "ghost"}
                  size="icon"
                  disabled={!chat.speechRecognitionSupported}
                  onClick={chat.onToggleDictation}
                  title={
                    chat.isListening
                      ? "Stop browser dictation"
                      : "Start browser dictation (speech-to-text into the prompt)"
                  }
                  className={cn(
                    "h-8 w-8 rounded-full",
                    !chat.isListening &&
                      "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-[#3b3b40] dark:hover:text-slate-100",
                  )}
                >
                  {chat.isListening ? (
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
              value={chat.reasoningEffort}
              onChange={(value) =>
                chat.onReasoningEffortChange(value as ReasoningEffort)
              }
              options={reasoningEffortOptions}
              title="Reasoning effort is sent to Responses API reasoning-capable deployments."
            />
          </>
        }
      />
    </>
  );
}
