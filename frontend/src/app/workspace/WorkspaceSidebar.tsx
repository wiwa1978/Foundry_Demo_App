import {
  Clock,
  GitCompareArrows,
  Mic,
  MicOff,
  Settings,
  SlidersHorizontal,
  Trash2,
  UploadCloud,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { RefObject } from "react";

import type { UseCaseWorkspace } from "@/app/types";
import {
  liveTranslationLanguages,
  liveTranslationSourceLanguages,
  maxComparisonModelCount,
  maxImageComparisonModelCount,
  traditionalTtsVoices,
} from "@/app/workspace/constants";
import type {
  ConfigResponse,
  StatusMessage,
  TraditionalVoiceStatus,
  ViewMode,
} from "@/app/workspace/contracts";
import {
  formatBytes,
  formatConfiguredGuardrail,
  formatModelName,
} from "@/app/workspace/formatters";
import {
  FoundryStatusPill,
  SidebarSection,
} from "@/app/workspace/WorkspacePrimitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DocumentSummary } from "@/features/documentQa/types";
import type { LiveTranslationMode } from "@/features/voice/types";
import { SidebarPipelineSelect } from "@/features/voice/VoiceWorkspaces";
import { cn } from "@/lib/utils";

export type WorkspaceSidebarWorkspaceViewModel = {
  activeView: ViewMode;
  workspace: UseCaseWorkspace;
  showDocumentControls: boolean;
  showBrowserVoiceControls: boolean;
  showComparisonControls: boolean;
  showImageComparisonControls: boolean;
  showTranscriptionComparisonControls: boolean;
  showEnableComparison: boolean;
  canUseProtectedApis: boolean;
  conversationsOpen: boolean;
  config: ConfigResponse | null;
  onToggleConversations: () => void;
  onEnableComparison: () => void;
};

export type WorkspaceSidebarModelsViewModel = {
  activeModel: string;
  catalogModels: string[];
  textModels: string[];
  transcriptionModels: string[];
  transcriptionModel: string;
  onActiveModelChange: (model: string) => void;
  onTranscriptionModelChange: (model: string) => void;
  onOpenSettings: (model: string) => void | Promise<void>;
};

export type WorkspaceSidebarDocumentsViewModel = {
  documents: DocumentSummary[];
  loading: boolean;
  message: StatusMessage | null;
  inputRef: RefObject<HTMLInputElement>;
  onUpload: (files: FileList | null) => void | Promise<void>;
  onRemove: (document: DocumentSummary) => void | Promise<void>;
};

export type WorkspaceSidebarSpeechVoice = Pick<
  SpeechSynthesisVoice,
  "voiceURI" | "name" | "lang"
>;

export type WorkspaceSidebarBrowserSpeechViewModel = {
  availableSpeechVoices: WorkspaceSidebarSpeechVoice[];
  isListening: boolean;
  selectedSpeechVoiceURI: string;
  selectedVoiceModel: string;
  speechRecognitionSupported: boolean;
  speechSynthesisSupported: boolean;
  voiceError: string;
  voiceReadbackEnabled: boolean;
  onVoiceModelChange: (model: string) => void;
  onSpeechVoiceChange: (voiceUri: string) => void;
  onToggleDictation: () => void;
  onToggleReadback: () => void;
};

export type WorkspaceSidebarComparisonViewModel = {
  selectedModels: Set<string>;
  onToggleModel: (model: string) => void;
  selectedTranscriptionModels: Set<string>;
  onToggleTranscriptionModel: (model: string) => void;
};

export type WorkspaceSidebarImagesViewModel = {
  model: string;
  models: string[];
  editModels: string[];
  selectedModels: Set<string>;
  onModelChange: (model: string) => void;
  onToggleComparisonModel: (model: string) => void;
};

export type WorkspaceSidebarGuardrailsViewModel = {
  enabled: boolean;
  isRunning: boolean;
  activePolicies: string[];
  deploymentPolicyName?: string;
  error: string;
  onToggle: () => void | Promise<void>;
};

export type WorkspaceSidebarVoiceViewModel = {
  status: TraditionalVoiceStatus;
  traditionalTranscriptionModels: string[];
  traditionalTranscriptionModel: string;
  ttsModels: string[];
  ttsModel: string;
  ttsVoice: string;
  onTraditionalTranscriptionModelChange: (model: string) => void;
  onTtsModelChange: (model: string) => void;
  onTtsVoiceChange: (voice: string) => void;
};

export type WorkspaceSidebarLiveTranslationViewModel = {
  mode: LiveTranslationMode;
  sourceLanguage: string;
  targetLanguage: string;
  active: boolean;
  onModeChange: (mode: LiveTranslationMode) => void;
  onSourceLanguageChange: (language: string) => void;
  onTargetLanguageChange: (language: string) => void;
};

export type WorkspaceSidebarProps = {
  workspace: WorkspaceSidebarWorkspaceViewModel;
  models: WorkspaceSidebarModelsViewModel;
  documents: WorkspaceSidebarDocumentsViewModel;
  browserSpeech: WorkspaceSidebarBrowserSpeechViewModel;
  comparison: WorkspaceSidebarComparisonViewModel;
  images: WorkspaceSidebarImagesViewModel;
  guardrails: WorkspaceSidebarGuardrailsViewModel;
  voice: WorkspaceSidebarVoiceViewModel;
  liveTranslation: WorkspaceSidebarLiveTranslationViewModel;
};

type ModelComparisonSelectorProps = {
  models: string[];
  selectedModels: Set<string>;
  maximum: number;
  maximumMessage: string;
  onToggle: (model: string) => void;
  onOpenSettings: (model: string) => void | Promise<void>;
};

function ModelComparisonSelector({
  models,
  selectedModels,
  maximum,
  maximumMessage,
  onToggle,
  onOpenSettings,
}: ModelComparisonSelectorProps) {
  return (
    <div className="mt-3 flex flex-col gap-2">
      {models.map((model) => {
        const selected = selectedModels.has(model);
        const disabled = !selected && selectedModels.size >= maximum;
        return (
          <div
            key={model}
            className={cn(
              "flex items-center justify-between rounded-md border px-2 py-1.5 text-sm",
              selected
                ? "border-blue-300 bg-blue-50 dark:border-violet-500/60 dark:bg-violet-500/15"
                : "border-slate-200 bg-white dark:border-[#606066] dark:bg-[#29292c]",
            )}
          >
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => onToggle(model)}
              disabled={disabled}
              title={disabled ? maximumMessage : undefined}
            >
              {formatModelName(model)}
            </button>
            <button
              type="button"
              className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-[#45454a]"
              onClick={() => void onOpenSettings(model)}
              aria-label={`Open settings for ${model}`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function WorkspaceSidebar({
  workspace,
  models,
  documents,
  browserSpeech,
  comparison,
  images,
  guardrails,
  voice,
  liveTranslation,
}: WorkspaceSidebarProps) {
  const imageWorkspace =
    workspace.workspace === "image" ||
    workspace.workspace === "imageEdit" ||
    workspace.workspace === "imageComparison";
  const selectedModel =
    workspace.workspace === "transcribe" ||
    workspace.workspace === "transcriptionComparison"
      ? models.transcriptionModel
      : imageWorkspace
        ? images.model
        : models.activeModel;
  const selectableModels =
    workspace.workspace === "transcribe" ||
    workspace.workspace === "transcriptionComparison"
      ? models.transcriptionModels
      : workspace.workspace === "imageEdit"
        ? images.editModels
        : imageWorkspace
          ? images.models
          : models.textModels;
  const pipelineDisabled =
    voice.status === "recording" || voice.status === "processing";
  const missingDocumentRagConfig = [
    workspace.config?.search_endpoint ? null : "AZURE_SEARCH_ENDPOINT",
    workspace.config?.search_index_name ? null : "AZURE_SEARCH_INDEX_NAME",
    workspace.config?.storage_account_url ? null : "AZURE_STORAGE_ACCOUNT_URL",
    workspace.config?.storage_container_name
      ? null
      : "AZURE_STORAGE_CONTAINER_NAME",
    workspace.config?.embedding_model ? null : "FOUNDRY_EMBEDDING_MODEL",
  ].filter((name): name is string => name !== null);
  const documentRagConfigMessage = workspace.config
    ? `Set ${missingDocumentRagConfig.join(", ")} to enable document RAG.`
    : "Loading document RAG configuration...";

  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-white p-4 shadow-sm dark:border-[#55555a] dark:bg-[#39393d]">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
        {workspace.workspace === "traditionalVoice" ? (
          <div className="grid gap-4">
            <SidebarPipelineSelect
              label="STT model"
              value={voice.traditionalTranscriptionModel}
              models={voice.traditionalTranscriptionModels}
              onChange={voice.onTraditionalTranscriptionModelChange}
              disabled={pipelineDisabled}
            />
            <div className="grid gap-2">
              <Label
                htmlFor="traditional-chat-model"
                className="palette-heading"
              >
                Chat model
              </Label>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <Select
                    value={models.activeModel}
                    onValueChange={models.onActiveModelChange}
                    disabled={pipelineDisabled}
                  >
                    <SelectTrigger
                      id="traditional-chat-model"
                      className="h-9 w-full dark:border-[#606066] dark:bg-[#29292c]"
                    >
                      <SelectValue placeholder="Select chat model" />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start">
                      {models.textModels.map((model) => (
                        <SelectItem key={model} value={model}>
                          {formatModelName(model)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={
                    !workspace.canUseProtectedApis || !models.activeModel
                  }
                  onClick={() => void models.onOpenSettings(models.activeModel)}
                  title="Open chat model settings"
                  className="shrink-0"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <SidebarPipelineSelect
              label="TTS model"
              value={voice.ttsModel}
              models={voice.ttsModels}
              onChange={voice.onTtsModelChange}
              disabled={pipelineDisabled}
            />
            <SidebarPipelineSelect
              label="TTS voice"
              value={voice.ttsVoice}
              models={[...traditionalTtsVoices]}
              onChange={voice.onTtsVoiceChange}
              disabled={pipelineDisabled}
            />
          </div>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor="active-model" className="palette-heading">
              Model
            </Label>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Select
                  value={selectedModel}
                  onValueChange={(model) => {
                    if (workspace.workspace === "transcribe") {
                      models.onTranscriptionModelChange(model);
                    } else if (imageWorkspace) {
                      images.onModelChange(model);
                    } else {
                      models.onActiveModelChange(model);
                    }
                  }}
                >
                  <SelectTrigger
                    id="active-model"
                    className="h-9 w-full dark:border-[#606066] dark:bg-[#29292c]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    {selectableModels.map((model) => (
                      <SelectItem key={model} value={model}>
                        {formatModelName(model)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!workspace.canUseProtectedApis}
                onClick={() => void models.onOpenSettings(selectedModel)}
                title="Open model settings"
                className="shrink-0"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="mt-4 border-t pt-4 dark:border-[#55555a]">
          <Button
            type="button"
            variant="outline"
            className={cn(
              "w-full justify-start",
              workspace.conversationsOpen &&
                "border-blue-300 bg-blue-50 text-blue-700 dark:border-violet-500/60 dark:bg-violet-500/15 dark:text-violet-200",
            )}
            onClick={workspace.onToggleConversations}
          >
            <Clock className="h-4 w-4" />
            Previous Conversations
          </Button>
        </div>

        {workspace.showDocumentControls ? (
          <div className="mt-4 border-t pt-4 dark:border-[#55555a]">
            <SidebarSection title="Documents">
              <div className="grid gap-2">
                <input
                  ref={documents.inputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.docx,.txt,.md,.csv,.json,.html,.htm,.xml,.log,text/*,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) =>
                    void documents.onUpload(event.target.files)
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  disabled={
                    !workspace.canUseProtectedApis ||
                    !workspace.config?.is_document_rag_configured ||
                    documents.loading
                  }
                  onClick={() => documents.inputRef.current?.click()}
                >
                  <UploadCloud className="h-4 w-4" />
                  {documents.loading ? "Indexing..." : "Upload documents"}
                </Button>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500 dark:border-[#606066] dark:bg-[#45454a] dark:text-slate-400">
                  {workspace.config?.is_document_rag_configured ? (
                    <>
                      <div className="font-medium text-slate-700 dark:text-slate-200">
                        Azure AI Search
                      </div>
                      <div
                        className="truncate"
                        title={workspace.config.search_index_name ?? undefined}
                      >
                        Index: {workspace.config.search_index_name}
                      </div>
                      <div
                        className="truncate"
                        title={
                          workspace.config.storage_container_name ?? undefined
                        }
                      >
                        Blob container:{" "}
                        {workspace.config.storage_container_name}
                      </div>
                      <div
                        className="truncate"
                        title={workspace.config.embedding_model ?? undefined}
                      >
                        Embeddings: {workspace.config.embedding_model}
                      </div>
                    </>
                  ) : (
                    documentRagConfigMessage
                  )}
                </div>
                {documents.message ? (
                  <p
                    role={
                      documents.message.type === "error" ? "alert" : "status"
                    }
                    aria-live="polite"
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs leading-5",
                      documents.message.type === "success"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100"
                        : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100",
                    )}
                  >
                    {documents.message.text}
                  </p>
                ) : null}
                <div className="grid max-h-64 gap-2 overflow-y-auto pr-1">
                  {documents.documents.length ? (
                    documents.documents.map((document) => (
                      <div
                        key={document.id}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-xs dark:border-[#606066] dark:bg-[#29292c]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div
                              className="truncate font-medium text-slate-800 dark:text-slate-100"
                              title={document.filename}
                            >
                              {document.filename}
                            </div>
                            <div className="mt-1 text-slate-500 dark:text-slate-400">
                              {document.chunk_count} chunks -{" "}
                              {formatBytes(document.byte_size)}
                            </div>
                            {document.blob_url ? (
                              <a
                                href={document.blob_url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 block truncate text-blue-700 hover:underline dark:text-violet-200"
                                title={document.blob_name ?? document.blob_url}
                              >
                                Open stored blob
                              </a>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-300"
                            onClick={() => void documents.onRemove(document)}
                            aria-label={`Delete ${document.filename}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500 dark:border-[#606066] dark:text-slate-400">
                      Upload documents to ask grounded questions.
                    </p>
                  )}
                </div>
              </div>
            </SidebarSection>
          </div>
        ) : null}

        {workspace.showBrowserVoiceControls ? (
          <div className="mt-4 border-t pt-4 dark:border-[#55555a]">
            <SidebarSection title="Browser convenience voice">
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={browserSpeech.onToggleDictation}
                  disabled={!browserSpeech.speechRecognitionSupported}
                  className={cn(
                    "flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#606066] dark:bg-[#45454a]",
                    browserSpeech.isListening &&
                      "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {browserSpeech.isListening ? (
                      <MicOff className="h-4 w-4 text-red-600" />
                    ) : (
                      <Mic className="h-4 w-4 text-violet-600" />
                    )}
                    Browser dictation
                  </span>
                  <Badge
                    variant={
                      browserSpeech.isListening ? "destructive" : "outline"
                    }
                    className="shrink-0"
                  >
                    {browserSpeech.isListening ? "Listening" : "Off"}
                  </Badge>
                </button>
                <button
                  type="button"
                  onClick={browserSpeech.onToggleReadback}
                  disabled={!browserSpeech.speechSynthesisSupported}
                  className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#606066] dark:bg-[#45454a]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {browserSpeech.voiceReadbackEnabled ? (
                      <Volume2 className="h-4 w-4 text-violet-600" />
                    ) : (
                      <VolumeX className="h-4 w-4 text-slate-500" />
                    )}
                    Browser readback
                  </span>
                  <Badge
                    variant={
                      browserSpeech.voiceReadbackEnabled ? "default" : "outline"
                    }
                    className="shrink-0"
                  >
                    {browserSpeech.voiceReadbackEnabled ? "On" : "Off"}
                  </Badge>
                </button>
                <div className="grid gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-[#606066] dark:bg-[#45454a]">
                  <Label
                    htmlFor="voice-model"
                    className="text-xs font-medium text-slate-600 dark:text-slate-300"
                  >
                    Text model for dictation
                  </Label>
                  <select
                    id="voice-model"
                    value={browserSpeech.selectedVoiceModel}
                    disabled={!models.catalogModels.length}
                    onChange={(event) =>
                      browserSpeech.onVoiceModelChange(event.target.value)
                    }
                    className="h-8 w-full min-w-0 truncate rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
                  >
                    {models.textModels.map((model) => (
                      <option key={model} value={model}>
                        {formatModelName(model)}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Browser speech-to-text becomes a text prompt for this model.
                  </p>
                </div>
                <div className="grid gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-[#606066] dark:bg-[#45454a]">
                  <Label
                    htmlFor="speech-voice"
                    className="text-xs font-medium text-slate-600 dark:text-slate-300"
                  >
                    Readback voice
                  </Label>
                  <select
                    id="speech-voice"
                    value={browserSpeech.selectedSpeechVoiceURI}
                    disabled={
                      !browserSpeech.speechSynthesisSupported ||
                      !browserSpeech.availableSpeechVoices.length
                    }
                    onChange={(event) =>
                      browserSpeech.onSpeechVoiceChange(event.target.value)
                    }
                    className="h-8 w-full min-w-0 truncate rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
                  >
                    {browserSpeech.availableSpeechVoices.length ? (
                      browserSpeech.availableSpeechVoices.map((speechVoice) => (
                        <option
                          key={speechVoice.voiceURI}
                          value={speechVoice.voiceURI}
                        >
                          {speechVoice.name} ({speechVoice.lang})
                        </option>
                      ))
                    ) : (
                      <option value="">System default</option>
                    )}
                  </select>
                </div>
                {browserSpeech.voiceError ? (
                  <p
                    role="alert"
                    className="text-xs text-amber-600 dark:text-amber-300"
                  >
                    {browserSpeech.voiceError}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Dictation and readback use browser speech APIs; available
                    voices depend on your browser and OS.
                  </p>
                )}
              </div>
            </SidebarSection>
          </div>
        ) : null}

        {workspace.showComparisonControls ? (
          <div className="mt-4 border-t pt-4 dark:border-[#55555a]">
            <SidebarSection title="Comparison">
              <div className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-left dark:border-violet-500/60 dark:bg-violet-500/15">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <GitCompareArrows className="h-4 w-4 text-violet-600" />
                  <span className="truncate">Side-by-side</span>
                </span>
                <Badge variant="default" className="shrink-0">
                  On
                </Badge>
              </div>
              <ModelComparisonSelector
                models={models.textModels}
                selectedModels={comparison.selectedModels}
                maximum={maxComparisonModelCount}
                maximumMessage={`You can compare up to ${maxComparisonModelCount} models.`}
                onToggle={comparison.onToggleModel}
                onOpenSettings={models.onOpenSettings}
              />
            </SidebarSection>
          </div>
        ) : null}

        {workspace.showTranscriptionComparisonControls ? (
          <div className="mt-4 border-t pt-4 dark:border-[#55555a]">
            <SidebarSection title="Transcription comparison">
              <div className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-left dark:border-violet-500/60 dark:bg-violet-500/15">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <GitCompareArrows className="h-4 w-4 text-violet-600" />
                  <span className="truncate">
                    One recording, multiple models
                  </span>
                </span>
                <Badge variant="default" className="shrink-0">
                  On
                </Badge>
              </div>
              <ModelComparisonSelector
                models={models.transcriptionModels}
                selectedModels={comparison.selectedTranscriptionModels}
                maximum={maxComparisonModelCount}
                maximumMessage={`You can compare up to ${maxComparisonModelCount} models.`}
                onToggle={comparison.onToggleTranscriptionModel}
                onOpenSettings={models.onOpenSettings}
              />
            </SidebarSection>
          </div>
        ) : null}

        {workspace.workspace === "liveTranslation" ? (
          <div className="mt-4 border-t pt-4 dark:border-[#55555a]">
            <SidebarSection title="Translation voice">
              <div className="grid gap-3">
                <Label>
                  Voice mode
                  <select
                    className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={liveTranslation.mode}
                    disabled={liveTranslation.active}
                    onChange={(event) =>
                      liveTranslation.onModeChange(
                        event.target.value as LiveTranslationMode,
                      )
                    }
                  >
                    <option value="standard">Standard neural voice</option>
                    <option value="personal">Personal Voice</option>
                  </select>
                </Label>
                {liveTranslation.mode === "standard" ? (
                  <Label>
                    Speak in
                    <select
                      className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={liveTranslation.sourceLanguage}
                      disabled={liveTranslation.active}
                      onChange={(event) =>
                        liveTranslation.onSourceLanguageChange(
                          event.target.value,
                        )
                      }
                    >
                      {liveTranslationSourceLanguages.map(([code, name]) => (
                        <option key={code} value={code}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </Label>
                ) : null}
                <Label>
                  Translate to
                  <select
                    className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={liveTranslation.targetLanguage}
                    disabled={liveTranslation.active}
                    onChange={(event) =>
                      liveTranslation.onTargetLanguageChange(event.target.value)
                    }
                  >
                    {liveTranslationLanguages.map(([code, name]) => (
                      <option key={code} value={code}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Label>
                {liveTranslation.mode === "personal" ? (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Requires Live Interpreter and Personal Voice approval.
                  </p>
                ) : null}
              </div>
            </SidebarSection>
          </div>
        ) : null}

        {workspace.showEnableComparison ? (
          <div className="mt-4 border-t pt-4 dark:border-[#55555a]">
            <SidebarSection title="Comparison">
              <button
                type="button"
                role="switch"
                aria-checked="false"
                onClick={workspace.onEnableComparison}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:bg-slate-50 dark:border-[#606066] dark:bg-[#29292c] dark:hover:bg-[#45454a]"
              >
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <GitCompareArrows className="h-4 w-4 shrink-0" />
                  <span className="truncate">Enable comparison</span>
                </span>
                <Badge variant="outline" className="shrink-0">
                  Off
                </Badge>
              </button>
            </SidebarSection>
          </div>
        ) : null}

        {workspace.showImageComparisonControls ? (
          <div className="mt-4 border-t pt-4 dark:border-[#55555a]">
            <SidebarSection title="Image comparison">
              <div className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-left dark:border-violet-500/60 dark:bg-violet-500/15">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <GitCompareArrows className="h-4 w-4 text-violet-600" />
                  <span className="truncate">Side-by-side images</span>
                </span>
                <Badge variant="default" className="shrink-0">
                  On
                </Badge>
              </div>
              <ModelComparisonSelector
                models={images.models}
                selectedModels={images.selectedModels}
                maximum={maxImageComparisonModelCount}
                maximumMessage="You can compare up to two image models."
                onToggle={images.onToggleComparisonModel}
                onOpenSettings={models.onOpenSettings}
              />
            </SidebarSection>
          </div>
        ) : null}

        {workspace.activeView === "chat" && workspace.workspace === "chat" ? (
          <div className="mt-4 border-t pt-4 dark:border-[#55555a]">
            <SidebarSection title="Guardrail test">
              <button
                type="button"
                onClick={() => void guardrails.onToggle()}
                disabled={!models.activeModel || guardrails.isRunning}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
                  guardrails.enabled
                    ? "border-slate-400 bg-slate-100 dark:border-[#77777d] dark:bg-[#505056]"
                    : "border-slate-200 bg-white hover:bg-slate-50 dark:border-[#606066] dark:bg-[#29292c] dark:hover:bg-[#45454a]",
                )}
              >
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <GitCompareArrows className="h-4 w-4 shrink-0" />
                  <span className="truncate">Side-by-side guardrails</span>
                </span>
                <Badge variant="outline" className="shrink-0">
                  {guardrails.enabled ? "On" : "Off"}
                </Badge>
              </button>
              {guardrails.enabled ? (
                <div className="mt-2 grid gap-1 text-xs text-slate-500 dark:text-slate-400">
                  {guardrails.activePolicies.map((policy, index) => (
                    <div key={`${policy}-${index}`} className="truncate">
                      Guardrail {index + 1}:{" "}
                      {formatConfiguredGuardrail(
                        policy,
                        guardrails.deploymentPolicyName,
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
              {guardrails.error ? (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  {guardrails.error}
                </p>
              ) : null}
            </SidebarSection>
          </div>
        ) : null}
      </div>
      <div className="mt-4 flex shrink-0 justify-center border-t pt-4 dark:border-[#55555a]">
        <FoundryStatusPill config={workspace.config} />
      </div>
    </aside>
  );
}
