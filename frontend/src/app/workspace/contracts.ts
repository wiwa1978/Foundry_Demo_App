export type {
  BrowserSpeechRecognition,
  BrowserSpeechRecognitionConstructor,
  BrowserSpeechRecognitionEvent,
  BrowserSpeechRecognitionResult,
  LiveInterpreterServerEvent,
  RealtimeServerEvent,
  RealtimeStatus,
  RealtimeTranscriptionDelay,
  RealtimeTranscriptionTurnDetection,
  RealtimeTranscriptEntry,
  TraditionalVoiceStatus,
  VoiceLiveServerEvent,
  VoiceLiveAvatarStatus,
} from "@/features/voice/types";

export type {
  AdminConfig,
  AdminDeploymentDraft,
  AuthResponse,
  ConfigResponse,
  DeploymentGuardrailPolicy,
  GuardrailPolicy,
  MetricsDay,
  ModelMetrics,
  ModelModality,
  ModelsResponse,
  ModelSettings,
  RealtimeSessionResponse,
  TraditionalSpeechResult,
  TraditionalVoiceResult,
  TraditionalVoiceVariantResult,
  TranscriptionResult,
} from "@/api/types";

export type ImageGenerationResult = {
  model: string;
  image_base64: string;
  mime_type: string;
  width: number;
  height: number;
  duration_ms: number;
  prompt: string;
};

export type Theme = "light" | "dark";
export type ColorPalette = "foundry" | "ocean" | "forest" | "ember";
export type ViewMode =
  | "chat"
  | "metrics"
  | "settings"
  | "model-settings"
  | "evaluation-admin"
  | "admin-monitor";

export type StatusMessage = {
  type: "success" | "error";
  text: string;
};

export type ApiTraceEntry = {
  id: string;
  timestamp: string;
  direction: "frontend_api" | "api_frontend" | "api_foundry" | "foundry_api";
  label: string;
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  request?: unknown;
  response?: unknown;
  error?: string;
};

export type ApiTraceFilter = "all" | "messages";
