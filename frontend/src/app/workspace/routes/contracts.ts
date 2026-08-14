import type {
  ContentExtractorMode,
  ContentExtractorResult,
} from "@media/content_extractor/frontend";
import type { LiveTranslationMode } from "@media/live_translation/frontend";
import type { TraditionalVoiceRequest } from "@media/stt_chat_tts/frontend";
import type { TextTranslationResult } from "@media/text_translation/frontend";
import type { YouTubeSummaryResult } from "@media/youtube_summary/frontend";
import type { RefObject } from "react";

import type {
  FetchClient,
  ModelBucketName,
  ModelRouterRoutingMode,
  UseCaseModelMap,
  UseCaseResourceSettings,
} from "@/api/types";
import type {
  UseCaseId,
  UseCaseWorkspace,
  WorkspaceRenderer,
} from "@/app/types";
import type {
  ColorPalette,
  DeploymentGuardrailPolicy,
  GuardrailPolicy,
  ImageGenerationResult,
  ModelMetrics,
  ModelModality,
  ModelSettings,
  RealtimeStatus,
  RealtimeTranscriptionDelay,
  RealtimeTranscriptionTurnDetection,
  RealtimeTranscriptEntry,
  StatusMessage,
  TraditionalVoiceResult,
  TraditionalVoiceStatus,
  TranscriptionResult,
  ViewMode,
} from "@/app/workspace/contracts";
import type { AdminDashboardTab } from "@/features/admin/AdminDashboardPage";
import type {
  ModelMetricSnapshot,
  ModelUsageSummary,
} from "@/features/admin/ModelMonitoringPage";
import type {
  AgentResearchCitation,
  AgentResearchRunConfig,
  AgentResearchStep,
  AgentResearchTrace,
} from "@/features/agentResearch/types";
import type {
  HostedAgentRunConfig,
  HostedAgentStep,
} from "@/features/hostedAgent/types";
import type { ChatMessage, ReasoningEffort } from "@/features/textChat/types";

export type WorkspaceContentRoute = {
  view: ViewMode;
  workspace: UseCaseWorkspace;
  useCase: UseCaseId;
  renderer: WorkspaceRenderer;
  enableComposerDictation: boolean;
};

export type WorkspaceAccessViewModel = {
  locked: boolean;
  loading: boolean;
  checking: boolean;
  canUseProtectedApis: boolean;
  onSignIn: () => void;
};

export type WorkspaceMonitoringViewModel = {
  modelUsages: ModelUsageSummary[];
  aggregateMetrics: ModelMetrics | null;
  modelMetrics: ModelMetricSnapshot[];
  days: number;
  loading: boolean;
  error: string;
  setDays: (days: number) => void;
  refresh: () => Promise<void>;
};

export type WorkspaceEvaluationAdminViewModel = {
  fetchClient: FetchClient;
  useCases: readonly { id: UseCaseId; title: string }[];
  models: string[];
  agents: string[];
};

export type WorkspaceAdminViewModel = {
  activeTab: AdminDashboardTab;
  onTabChange: (tab: AdminDashboardTab) => void;
  evaluations: WorkspaceEvaluationAdminViewModel;
  monitoring: WorkspaceMonitoringViewModel;
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
  liveTranslationSettings: UseCaseResourceSettings;
  liveTranslationSettingsLoading: boolean;
  liveTranslationSettingsSaving: boolean;
  liveTranslationSettingsMessage: string;
  useCaseModelMap: UseCaseModelMap;
  useCaseModelBucketNames: ModelBucketName[];
  useCaseModelMapLoading: boolean;
  useCaseModelMapSaving: boolean;
  useCaseModelMapMessage: string;
  onNewModelChange: (value: string) => void;
  onAddModel: () => void;
  onOpenAdmin: () => void;
  onOpenEvaluationsAdmin?: () => void;
  onSaveLiveTranslationSettings: (binding: string) => Promise<void>;
  onSaveUseCaseModelMap: (mapping: UseCaseModelMap) => Promise<void>;
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
  creatingPolicyCopies: boolean;
  error: string;
  onClose: () => void;
  save: () => Promise<void>;
  createPolicyCopies: () => Promise<void>;
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
  saveToGallery: boolean;
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
  setSaveToGallery: (save: boolean) => void;
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

export type WorkspaceTranscriptionComparisonViewModel = Omit<
  WorkspaceTranscriptionViewModel,
  "model" | "result"
> & {
  models: string[];
  results: Record<string, TranscriptionResult[]>;
  modelErrors: Record<string, string>;
  pendingModels: Set<string>;
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

export type WorkspaceRealtimeTranscriptionViewModel = {
  configured: boolean;
  model: string;
  status: RealtimeStatus;
  error: string;
  transcript: string;
  language: string;
  delay: RealtimeTranscriptionDelay;
  turnDetection: RealtimeTranscriptionTurnDetection;
  onLanguageChange: (value: string) => void;
  onDelayChange: (value: RealtimeTranscriptionDelay) => void;
  onTurnDetectionChange: (value: RealtimeTranscriptionTurnDetection) => void;
  onStart: () => void;
  onStop: () => void;
};

export type WorkspaceRealtimeTranslationViewModel = {
  configured: boolean;
  model: string;
  transcriptionModel: string;
  models: string[];
  sourceLanguage: string;
  status: RealtimeStatus;
  error: string;
  targetLanguage: string;
  sourceTranscript: string;
  translatedTranscript: string;
  onModelChange: (value: string) => void;
  onSourceLanguageChange: (value: string) => void;
  onTargetLanguageChange: (value: string) => void;
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
  mode: LiveTranslationMode;
  sourceLanguage: string;
  targetLanguage: string;
  transcript: RealtimeTranscriptEntry[];
  sourceTranscript: string;
  translatedTranscript: string;
  audioPlaybackEnabled: boolean;
  onModeChange: (mode: LiveTranslationMode) => void;
  onSourceLanguageChange: (language: string) => void;
  onTargetLanguageChange: (language: string) => void;
  onAudioPlaybackEnabledChange: (enabled: boolean) => void;
  onStart: () => void;
  onStop: () => void;
};

export type WorkspaceRealtimeViewModel = {
  session: WorkspaceRealtimeSessionViewModel;
  webRtcTranscription: WorkspaceRealtimeTranscriptionViewModel;
  webSocketTranscription: WorkspaceRealtimeTranscriptionViewModel;
  webRtcTranslation: WorkspaceRealtimeTranslationViewModel;
  webSocketTranslation: WorkspaceRealtimeTranslationViewModel;
  voiceLive: WorkspaceVoiceLiveViewModel;
  liveTranslation: WorkspaceLiveTranslationViewModel;
};

export type WorkspaceGuardrailsViewModel = {
  enabled: boolean;
  policyNames: string[];
  deploymentPolicyName?: string | null;
};

export type WorkspaceYouTubeSummaryViewModel = {
  url: string;
  language: string;
  model: string;
  models: string[];
  transcriptionModel: string;
  transcriptionModels: string[];
  result: YouTubeSummaryResult | null;
  loading: boolean;
  error: string;
  onUrlChange: (value: string) => void;
  onLanguageChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onTranscriptionModelChange: (value: string) => void;
  onSummarize: () => void;
};

export type WorkspaceContentExtractorViewModel = {
  configured: boolean;
  mode: ContentExtractorMode;
  file: File | null;
  result: ContentExtractorResult | null;
  loading: boolean;
  error: string;
  fileInputRef: RefObject<HTMLInputElement>;
  onModeChange: (mode: ContentExtractorMode) => void;
  onFileChange: (file: File | null) => void;
  onExtract: () => void;
};

export type WorkspaceTextTranslationViewModel = {
  configured: boolean;
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
  result: TextTranslationResult | null;
  loading: boolean;
  error: string;
  onSourceTextChange: (value: string) => void;
  onSourceLanguageChange: (value: string) => void;
  onTargetLanguageChange: (value: string) => void;
  onTranslate: () => void;
};

export type WorkspaceYouTubeRealtimeTranscriptionViewModel = {
  url: string;
  model: string;
  models: string[];
  language: string;
  delay: RealtimeTranscriptionDelay;
  status: RealtimeStatus;
  statusMessage: string;
  error: string;
  transcript: string;
  videoId: string | null;
  configured: boolean;
  onUrlChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onLanguageChange: (value: string) => void;
  onDelayChange: (value: RealtimeTranscriptionDelay) => void;
  onStart: () => void;
  onStop: () => void;
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
  modelRouterRouting: {
    mode: ModelRouterRoutingMode;
    loading: boolean;
    saving: boolean;
    error: string;
    onChange: (mode: ModelRouterRoutingMode) => void;
  } | null;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onDocumentSubmit: () => void;
  onOpenSettings: (model: string) => void;
  onActiveModelChange: (model: string) => void;
  onToggleDictation: () => void;
  onReasoningEffortChange: (effort: ReasoningEffort) => void;
  onOpenUseCases: () => void;
};

export type WorkspaceAgentResearchViewModel = {
  configured: boolean;
  projectEndpoint: string | null;
  question: string;
  answer: string;
  steps: AgentResearchStep[];
  citations: AgentResearchCitation[];
  runConfig: AgentResearchRunConfig | null;
  isRunning: boolean;
  error: string;
  trace: AgentResearchTrace | null;
  traceLoading: boolean;
  traceError: string;
  onQuestionChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export type WorkspaceHostedAgentViewModel = {
  configured: boolean;
  agentName: string | null;
  projectEndpoint: string | null;
  message: string;
  answer: string;
  steps: HostedAgentStep[];
  runConfig: HostedAgentRunConfig | null;
  isRunning: boolean;
  error: string;
  onMessageChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export type WorkspaceContentRouterProps = {
  route: WorkspaceContentRoute;
  access: WorkspaceAccessViewModel;
  admin: WorkspaceAdminViewModel;
  metrics: WorkspaceMetricsViewModel;
  settings: WorkspaceSettingsViewModel;
  images: WorkspaceImagesViewModel;
  comparison: WorkspaceComparisonViewModel;
  traditionalVoice: WorkspaceTraditionalVoiceViewModel;
  transcription: WorkspaceTranscriptionViewModel;
  transcriptionComparison: WorkspaceTranscriptionComparisonViewModel;
  realtime: WorkspaceRealtimeViewModel;
  guardrails: WorkspaceGuardrailsViewModel;
  youtubeSummary: WorkspaceYouTubeSummaryViewModel;
  youtubeRealtimeTranscription: WorkspaceYouTubeRealtimeTranscriptionViewModel;
  contentExtractor: WorkspaceContentExtractorViewModel;
  textTranslation: WorkspaceTextTranslationViewModel;
  chat: WorkspaceChatViewModel;
  agentResearch: WorkspaceAgentResearchViewModel;
  hostedAgent: WorkspaceHostedAgentViewModel;
};
