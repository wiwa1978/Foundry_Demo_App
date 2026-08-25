import type { DocumentSummary } from "@media/document_qa/frontend";
import {
  Clock,
  FileAudio,
  FileText,
  GitCompareArrows,
  ImageIcon,
  LoaderCircle,
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
import {
  contentExtractorDocumentAnalyzers,
  contentExtractorModes,
} from "@/features/contentExtractor/types";
import type {
  ContentExtractorDocumentAnalyzer,
  ContentExtractorMode,
  ContentExtractorSample,
} from "@/features/contentExtractor/types";
import type { HostedAgentVariant } from "@/features/hostedAgent/types";
import type { ImageSample } from "@/features/images/api";
import {
  azureSpeechEmotions,
  azureSpeechLanguageSkills,
  azureSpeechModels,
  azureSpeechVoiceNames,
  gptAudioVoices,
} from "@/features/voice/AzureSpeechTtsWorkspace";
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

export type WorkspaceSidebarContentExtractorViewModel = {
  configured: boolean;
  mode: ContentExtractorMode;
  analyzer: ContentExtractorDocumentAnalyzer;
  file: File | null;
  loading: boolean;
  error: string;
  samples: ImageSample[];
  contentSamples?: ContentExtractorSample[];
  samplesLoading: boolean;
  sampleError: string;
  inputRef: RefObject<HTMLInputElement>;
  onModeChange: (value: ContentExtractorMode) => void;
  onAnalyzerChange: (value: ContentExtractorDocumentAnalyzer) => void;
  onFileChange: (file: File | null) => void | Promise<void>;
  onSelectSample: (
    sample: ImageSample | ContentExtractorSample,
  ) => void | Promise<void>;
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
  languageLearning?: boolean;
  language?: string;
  traditionalTranscriptionModels: string[];
  traditionalTranscriptionModel: string;
  ttsModels: string[];
  ttsModel: string;
  ttsVoice: string;
  gptAudioModels?: string[];
  azureSpeechModel?: string;
  azureSpeechVoiceName?: string;
  azureSpeechLanguageSkill?: string;
  azureSpeechEmotion?: string;
  azureSpeechPitch?: number;
  azureSpeechRate?: number;
  azureSpeechVolume?: number;
  foundryGptAudioModel?: string;
  foundryGptAudioVoice?: string;
  onTraditionalTranscriptionModelChange: (model: string) => void;
  onLanguageChange?: (language: string) => void;
  onTtsModelChange: (model: string) => void;
  onTtsVoiceChange: (voice: string) => void;
  onAzureSpeechModelChange?: (model: string) => void;
  onAzureSpeechVoiceNameChange?: (voice: string) => void;
  onAzureSpeechLanguageSkillChange?: (language: string) => void;
  onAzureSpeechEmotionChange?: (emotion: string) => void;
  onAzureSpeechPitchChange?: (value: number) => void;
  onAzureSpeechRateChange?: (value: number) => void;
  onAzureSpeechVolumeChange?: (value: number) => void;
  onFoundryGptAudioModelChange?: (model: string) => void;
  onFoundryGptAudioVoiceChange?: (voice: string) => void;
};

export type WorkspaceSidebarTextTranslationViewModel = {
  mode: string;
  modeOptions: { value: string; label: string }[];
  sourceLanguage: string;
  sourceLanguageOptions: { value: string; label: string }[];
  targetLanguage: string;
  targetLanguageOptions: { value: string; label: string }[];
  model: string;
  modelOptions: string[];
  loading: boolean;
  audioEnabled: boolean;
  onModeChange: (mode: string) => void;
  onSourceLanguageChange: (language: string) => void;
  onTargetLanguageChange: (language: string) => void;
  onModelChange: (model: string) => void;
  onAudioEnabledChange: (enabled: boolean) => void;
};

export type WorkspaceSidebarProps = {
  workspace: WorkspaceSidebarWorkspaceViewModel;
  models: WorkspaceSidebarModelsViewModel;
  documents: WorkspaceSidebarDocumentsViewModel;
  contentExtractor: WorkspaceSidebarContentExtractorViewModel;
  browserSpeech: WorkspaceSidebarBrowserSpeechViewModel;
  comparison: WorkspaceSidebarComparisonViewModel;
  images: WorkspaceSidebarImagesViewModel;
  guardrails: WorkspaceSidebarGuardrailsViewModel;
  voice: WorkspaceSidebarVoiceViewModel;
  textTranslation?: WorkspaceSidebarTextTranslationViewModel;
  hostedAgent?: {
    variants: HostedAgentVariant[];
    variantKey: string;
    isRunning: boolean;
    onVariantChange: (key: string) => void;
  };
  agentMode?: {
    mode: "prompt" | "hosted";
    onModeChange: (mode: "prompt" | "hosted") => void;
    disabled?: boolean;
  };
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

function contentExtractorModeIcon(mode: ContentExtractorMode) {
  if (mode === "document") {
    return <FileText className="h-4 w-4" />;
  }
  if (mode === "audio") {
    return <FileAudio className="h-4 w-4" />;
  }
  return <ImageIcon className="h-4 w-4" />;
}

function contentExtractorAcceptTypes(mode: ContentExtractorMode) {
  if (mode === "document") {
    return "application/pdf,image/jpeg,image/png,image/webp,image/bmp,image/tiff";
  }
  if (mode === "audio") {
    return "audio/wav,audio/mpeg,audio/mp3,audio/mp4,audio/m4a,audio/ogg,audio/webm,audio/flac";
  }
  return "image/jpeg,image/png,image/webp,image/bmp,image/tiff";
}

function contentExtractorHelpText(mode: ContentExtractorMode) {
  if (mode === "document") {
    return "PDF, JPEG, PNG, WebP, BMP, or TIFF up to 20 MB.";
  }
  if (mode === "audio") {
    return "WAV, MP3, MP4/M4A, OGG, WebM, or FLAC up to 25 MB.";
  }
  return "JPEG, PNG, WebP, BMP, or TIFF up to 10 MB.";
}

function SidebarSimpleSelect({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="palette-heading">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          id={id}
          className="h-9 w-full dark:border-[#606066] dark:bg-[#29292c]"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SidebarRange({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
      <span className="flex items-center justify-between">
        <span>{label}</span>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs dark:bg-[#29292c]">
          {value}
        </span>
      </span>
      <input
        id={`sidebar-range-${label}`}
        aria-label={label}
        type="range"
        min={-50}
        max={50}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full"
        style={{ accentColor: "var(--palette-color-1)" }}
      />
    </div>
  );
}

export function WorkspaceSidebar({
  workspace,
  models,
  documents,
  contentExtractor,
  browserSpeech,
  comparison,
  images,
  guardrails,
  voice,
  textTranslation,
  hostedAgent,
  agentMode,
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
  const isTranslatorMode = textTranslation?.mode === "translator_text";
  const sourceLanguageLabel = isTranslatorMode
    ? "Translate from"
    : textTranslation?.mode === "language_detection_text"
      ? "Language hint"
      : "Text language";
  const selectableModels =
    workspace.workspace === "transcribe" ||
    workspace.workspace === "transcriptionComparison"
      ? models.transcriptionModels
      : workspace.workspace === "imageEdit"
        ? images.editModels
        : imageWorkspace
          ? images.models
          : models.textModels;
  const hidesModelSelector =
    workspace.workspace === "contentExtractor" ||
    workspace.workspace === "azureSpeechTts" ||
    workspace.workspace === "foundryGptAudio" ||
    workspace.workspace === "textTranslation" ||
    workspace.workspace === "realtimeTranslationWebRtc" ||
    workspace.workspace === "realtimeTranslationWebSocket" ||
    workspace.workspace === "liveTranslation";
  const pipelineDisabled =
    voice.status === "recording" || voice.status === "processing";
  const azureSpeechModel = voice.azureSpeechModel ?? "DragonHDLatestNeural";
  const azureSpeechVoiceName = voice.azureSpeechVoiceName ?? "Ava";
  const azureSpeechLanguageSkill = voice.azureSpeechLanguageSkill ?? "auto";
  const azureSpeechEmotion = voice.azureSpeechEmotion ?? "neutral";
  const azureSpeechPitch = voice.azureSpeechPitch ?? 1;
  const azureSpeechRate = voice.azureSpeechRate ?? 1;
  const azureSpeechVolume = voice.azureSpeechVolume ?? 1;
  const foundryGptAudioModel = voice.foundryGptAudioModel ?? "gpt-audio-mini";
  const foundryGptAudioVoice = voice.foundryGptAudioVoice ?? "alloy";
  const gptAudioModelOptions = voice.gptAudioModels?.length
    ? voice.gptAudioModels
    : ["gpt-audio-mini", "gpt-audio-1.5"];
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
        {workspace.workspace === "azureSpeechTts" ? (
          <div className="grid gap-4">
            <SidebarSimpleSelect
              id="azure-tts-voice"
              label="Voice"
              value={azureSpeechVoiceName}
              onChange={voice.onAzureSpeechVoiceNameChange ?? (() => undefined)}
              options={azureSpeechVoiceNames.map((item) => ({
                value: item.value,
                label: `${item.label} · ${item.gender}`,
              }))}
              disabled={pipelineDisabled}
            />
            <SidebarSimpleSelect
              id="azure-tts-model"
              label="Model"
              value={azureSpeechModel}
              onChange={voice.onAzureSpeechModelChange ?? (() => undefined)}
              options={azureSpeechModels.map((item) => ({
                value: item.value,
                label: item.label,
              }))}
              disabled={pipelineDisabled}
            />
            <SidebarSimpleSelect
              id="azure-tts-language-skill"
              label="Language skill"
              value={azureSpeechLanguageSkill}
              onChange={
                voice.onAzureSpeechLanguageSkillChange ?? (() => undefined)
              }
              options={azureSpeechLanguageSkills}
              disabled={pipelineDisabled}
            />
            <SidebarSimpleSelect
              id="azure-tts-emotion"
              label="Emotion"
              value={azureSpeechEmotion}
              onChange={voice.onAzureSpeechEmotionChange ?? (() => undefined)}
              options={azureSpeechEmotions.map((item) => ({
                value: item,
                label: formatModelName(item),
              }))}
              disabled={pipelineDisabled}
            />
            <SidebarSection title="Tuning">
              <div className="grid gap-4">
                <SidebarRange
                  label="Pitch"
                  value={azureSpeechPitch}
                  onChange={voice.onAzureSpeechPitchChange ?? (() => undefined)}
                  disabled={pipelineDisabled}
                />
                <SidebarRange
                  label="Rate"
                  value={azureSpeechRate}
                  onChange={voice.onAzureSpeechRateChange ?? (() => undefined)}
                  disabled={pipelineDisabled}
                />
                <SidebarRange
                  label="Volume"
                  value={azureSpeechVolume}
                  onChange={
                    voice.onAzureSpeechVolumeChange ?? (() => undefined)
                  }
                  disabled={pipelineDisabled}
                />
              </div>
            </SidebarSection>
          </div>
        ) : workspace.workspace === "foundryGptAudio" ? (
          <div className="grid gap-4">
            <SidebarSimpleSelect
              id="foundry-gpt-audio-model"
              label="Model"
              value={foundryGptAudioModel}
              onChange={voice.onFoundryGptAudioModelChange ?? (() => undefined)}
              options={gptAudioModelOptions.map((model) => ({
                value: model,
                label: formatModelName(model),
              }))}
              disabled={pipelineDisabled}
            />
            <SidebarSimpleSelect
              id="foundry-gpt-audio-voice"
              label="Voice"
              value={foundryGptAudioVoice}
              onChange={voice.onFoundryGptAudioVoiceChange ?? (() => undefined)}
              options={gptAudioVoices.map((item) => ({
                value: item,
                label: formatModelName(item),
              }))}
              disabled={pipelineDisabled}
            />
          </div>
        ) : workspace.workspace === "traditionalVoice" ? (
          <div className="grid gap-4">
            {voice.languageLearning ? (
              <div className="grid gap-2">
                <Label
                  htmlFor="language-learning-target-language"
                  className="palette-heading"
                >
                  Target language
                </Label>
                <select
                  id="language-learning-target-language"
                  value={voice.language ?? "en-US"}
                  onChange={(event) =>
                    voice.onLanguageChange?.(event.target.value)
                  }
                  disabled={pipelineDisabled}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
                >
                  <option value="en-US">English (United States)</option>
                  <option value="en-GB">English (United Kingdom)</option>
                  <option value="nl-NL">Dutch (Netherlands)</option>
                  <option value="fr-FR">French (France)</option>
                  <option value="de-DE">German (Germany)</option>
                  <option value="es-ES">Spanish (Spain)</option>
                </select>
              </div>
            ) : null}
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
        ) : workspace.workspace === "hostedAgent" ||
          workspace.workspace ===
            "azureArchitectAgent" ? null : hidesModelSelector ? (
          <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-[#606066] dark:bg-[#45454a] dark:text-slate-300">
            <p className="font-medium text-slate-700 dark:text-slate-100">
              {workspace.workspace === "contentExtractor"
                ? "Content Extractor"
                : workspace.workspace === "textTranslation"
                  ? "Language Services"
                  : workspace.workspace === "liveTranslation"
                    ? "Azure Speech Live Translation"
                    : workspace.workspace === "realtimeTranslationWebRtc"
                      ? "GPT Realtime Translation webrtc"
                      : "GPT Realtime Translation websockets"}
            </p>
            <p className="text-xs leading-5">
              {workspace.workspace === "contentExtractor"
                ? "Uses Azure Content Understanding. Upload source files below; image extraction is enabled first."
                : workspace.workspace === "textTranslation"
                  ? "Uses Azure Translator and Azure Language modes selected in the workspace. No chat model is used."
                  : workspace.workspace === "liveTranslation"
                    ? "Uses Azure Speech resources and voice mode controls in the workspace. No chat model is used."
                    : workspace.workspace === "realtimeTranslationWebRtc"
                      ? "Uses a short-lived token and browser WebRTC directly to Foundry. If Foundry rejects WebRTC for gpt-realtime-translate, the workspace shows that provider limitation."
                      : "Uses the configured gpt-realtime-translate deployment through the backend WebSocket proxy. Select the translation model and target language in the workspace controls."}
            </p>
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

        {(workspace.workspace === "azureArchitectAgent" ||
          workspace.workspace === "hostedAgent") &&
        agentMode ? (
          <div className="mt-4 border-t pt-4 dark:border-[#55555a]">
            <SidebarSimpleSelect
              id="agent-implementation-mode"
              label="Agent implementation"
              value={agentMode.mode}
              onChange={(value) =>
                agentMode.onModeChange(value as "prompt" | "hosted")
              }
              options={[
                { value: "prompt", label: "Prompt Agent" },
                { value: "hosted", label: "Hosted Agent" },
              ]}
              disabled={agentMode.disabled ?? false}
            />
          </div>
        ) : null}

        {workspace.workspace === "hostedAgent" &&
        (hostedAgent?.variants.length ?? 0) > 1 ? (
          <div className="mt-4 border-t pt-4 dark:border-[#55555a]">
            <SidebarSimpleSelect
              id="hosted-agent-implementation"
              label="Hosted agent implementation"
              value={hostedAgent?.variantKey ?? ""}
              onChange={hostedAgent?.onVariantChange ?? (() => undefined)}
              options={(hostedAgent?.variants ?? []).map((variant) => ({
                value: variant.key,
                label: variant.label,
              }))}
              disabled={hostedAgent?.isRunning ?? false}
            />
          </div>
        ) : null}

        {workspace.workspace === "contentExtractor" ? (
          <div className="mt-4 border-t pt-4 dark:border-[#55555a]">
            <SidebarSection title="Content source">
              <div className="grid gap-3">
                <label
                  className="palette-heading text-xs uppercase tracking-wide"
                  htmlFor="content-extractor-mode"
                >
                  Source type
                </label>
                <select
                  id="content-extractor-mode"
                  value={contentExtractor.mode}
                  disabled={contentExtractor.loading}
                  onChange={(event) =>
                    contentExtractor.onModeChange(
                      event.target.value as ContentExtractorMode,
                    )
                  }
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100 dark:focus:border-violet-400 dark:focus:ring-violet-500/20"
                >
                  {contentExtractorModes.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                {contentExtractor.mode === "document" ? (
                  <>
                    <label
                      className="palette-heading text-xs uppercase tracking-wide"
                      htmlFor="content-extractor-analyzer"
                    >
                      Document analyzer
                    </label>
                    <select
                      id="content-extractor-analyzer"
                      value={contentExtractor.analyzer}
                      disabled={contentExtractor.loading}
                      onChange={(event) =>
                        contentExtractor.onAnalyzerChange(
                          event.target
                            .value as ContentExtractorDocumentAnalyzer,
                        )
                      }
                      className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100 dark:focus:border-violet-400 dark:focus:ring-violet-500/20"
                    >
                      {contentExtractorDocumentAnalyzers.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {
                        contentExtractorDocumentAnalyzers.find(
                          (item) => item.value === contentExtractor.analyzer,
                        )?.description
                      }
                    </p>
                  </>
                ) : null}
                <input
                  ref={contentExtractor.inputRef}
                  type="file"
                  aria-label={`Upload ${contentExtractor.mode} for content extraction`}
                  accept={contentExtractorAcceptTypes(contentExtractor.mode)}
                  className="hidden"
                  onChange={(event) => {
                    void contentExtractor.onFileChange(
                      event.target.files?.[0] ?? null,
                    );
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  disabled={contentExtractor.loading}
                  onClick={() => contentExtractor.inputRef.current?.click()}
                >
                  {contentExtractor.loading ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    contentExtractorModeIcon(contentExtractor.mode)
                  )}
                  {contentExtractor.loading
                    ? "Extracting..."
                    : contentExtractor.file
                      ? contentExtractor.file.name
                      : `Upload ${contentExtractor.mode}`}
                </Button>
                <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {contentExtractorHelpText(contentExtractor.mode)}
                </p>
                {contentExtractor.mode === "image" ? (
                  <div className="grid gap-2 border-t border-slate-200 pt-3 dark:border-[#55555a]">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Image Prompt gallery
                    </div>
                    {contentExtractor.samplesLoading &&
                    !contentExtractor.samples.length ? (
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Loading images...
                      </div>
                    ) : null}
                    {!contentExtractor.samplesLoading &&
                    !contentExtractor.samples.length ? (
                      <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs leading-5 text-slate-500 dark:border-[#606066] dark:text-slate-400">
                        No gallery images yet. Generate images in Text to Image,
                        or seed Blob Storage under image-samples/.
                      </p>
                    ) : null}
                    {contentExtractor.samples.length ? (
                      <div className="grid grid-cols-2 gap-2">
                        {contentExtractor.samples.map((sample) => (
                          <button
                            key={sample.id}
                            type="button"
                            disabled={
                              contentExtractor.samplesLoading ||
                              contentExtractor.loading
                            }
                            onClick={() =>
                              void contentExtractor.onSelectSample(sample)
                            }
                            className="group overflow-hidden rounded-lg border border-slate-200 bg-white text-left text-xs shadow-sm transition hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#606066] dark:bg-[#29292c] dark:hover:border-violet-400"
                            title={sample.name}
                          >
                            <img
                              src={sample.image_url}
                              alt=""
                              className="h-20 w-full object-cover"
                              loading="lazy"
                            />
                            <span className="block truncate px-2 py-1.5 text-slate-600 dark:text-slate-300">
                              {sample.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {contentExtractor.mode !== "image" ? (
                  <div className="grid gap-2 border-t border-slate-200 pt-3 dark:border-[#55555a]">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {contentExtractor.mode === "document"
                        ? "Document samples"
                        : "Audio samples"}
                    </div>
                    {contentExtractor.samplesLoading &&
                    !(contentExtractor.contentSamples?.length ?? 0) ? (
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Loading samples...
                      </div>
                    ) : null}
                    {!contentExtractor.samplesLoading &&
                    !(contentExtractor.contentSamples?.length ?? 0) ? (
                      <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs leading-5 text-slate-500 dark:border-[#606066] dark:text-slate-400">
                        No samples yet. Seed Blob Storage under{" "}
                        {contentExtractor.mode === "document"
                          ? "document-samples/"
                          : "audio-samples/"}
                        .
                      </p>
                    ) : null}
                    {contentExtractor.contentSamples?.length ? (
                      <div className="grid gap-2">
                        {contentExtractor.contentSamples.map((sample) => (
                          <button
                            key={sample.id}
                            type="button"
                            disabled={
                              contentExtractor.samplesLoading ||
                              contentExtractor.loading
                            }
                            onClick={() =>
                              void contentExtractor.onSelectSample(sample)
                            }
                            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs shadow-sm transition hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#606066] dark:bg-[#29292c] dark:hover:border-violet-400"
                            title={sample.description || sample.name}
                          >
                            {contentExtractor.mode === "document" ? (
                              <FileText className="h-5 w-5 shrink-0 text-blue-500" />
                            ) : (
                              <FileAudio className="h-5 w-5 shrink-0 text-violet-500" />
                            )}
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-slate-700 dark:text-slate-200">
                                {sample.name}
                              </span>
                              <span className="block truncate text-slate-400">
                                {sample.id}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {contentExtractor.mode === "image" &&
                contentExtractor.sampleError ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
                    {contentExtractor.sampleError}
                  </p>
                ) : null}
                {!contentExtractor.configured ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                    Configure FOUNDRY_PROJECT_ENDPOINT or
                    FOUNDRY_CONTENT_UNDERSTANDING_ENDPOINT.
                  </p>
                ) : null}
                {contentExtractor.error ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
                    {contentExtractor.error}
                  </p>
                ) : null}
              </div>
            </SidebarSection>
          </div>
        ) : null}

        {workspace.workspace === "textTranslation" && textTranslation ? (
          <div className="mt-4 border-t pt-4 dark:border-[#55555a]">
            <SidebarSection title="Language Services">
              <div className="grid gap-3">
                <label
                  className="palette-heading text-xs uppercase tracking-wide"
                  htmlFor="text-translation-mode"
                >
                  Mode
                </label>
                <select
                  id="text-translation-mode"
                  value={textTranslation.mode}
                  disabled={textTranslation.loading}
                  onChange={(event) =>
                    textTranslation.onModeChange(event.target.value)
                  }
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100 dark:focus:border-violet-400 dark:focus:ring-violet-500/20"
                >
                  {textTranslation.modeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <label
                  className="palette-heading text-xs uppercase tracking-wide"
                  htmlFor="text-translation-source-language"
                >
                  {sourceLanguageLabel}
                </label>
                <select
                  id="text-translation-source-language"
                  value={textTranslation.sourceLanguage}
                  disabled={textTranslation.loading}
                  onChange={(event) =>
                    textTranslation.onSourceLanguageChange(event.target.value)
                  }
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100 dark:focus:border-violet-400 dark:focus:ring-violet-500/20"
                >
                  {textTranslation.sourceLanguageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                {isTranslatorMode ? (
                  <>
                    <label
                      className="palette-heading text-xs uppercase tracking-wide"
                      htmlFor="text-translation-target-language"
                    >
                      Translate to
                    </label>
                    <select
                      id="text-translation-target-language"
                      value={textTranslation.targetLanguage}
                      disabled={textTranslation.loading}
                      onChange={(event) =>
                        textTranslation.onTargetLanguageChange(
                          event.target.value,
                        )
                      }
                      className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100 dark:focus:border-violet-400 dark:focus:ring-violet-500/20"
                    >
                      {textTranslation.targetLanguageOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {textTranslation.modelOptions.length > 0 ? (
                      <>
                        <label
                          className="palette-heading text-xs uppercase tracking-wide"
                          htmlFor="text-translation-model"
                        >
                          Model
                        </label>
                        <select
                          id="text-translation-model"
                          value={textTranslation.model}
                          disabled={textTranslation.loading}
                          onChange={(event) =>
                            textTranslation.onModelChange(event.target.value)
                          }
                          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100 dark:focus:border-violet-400 dark:focus:ring-violet-500/20"
                        >
                          {textTranslation.modelOptions.map((model) => (
                            <option key={model} value={model}>
                              {model}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : null}
                  </>
                ) : null}
                {textTranslation.mode === "translator_text" ? (
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={textTranslation.audioEnabled}
                      disabled={textTranslation.loading}
                      onChange={(event) =>
                        textTranslation.onAudioEnabledChange(
                          event.target.checked,
                        )
                      }
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-[#707076] dark:bg-[#29292c] dark:text-violet-400"
                    />
                    Enable audio
                  </label>
                ) : null}
              </div>
            </SidebarSection>
          </div>
        ) : null}

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
