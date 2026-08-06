import type {
  Conversation,
  FoundryRequestTrace,
  FoundryResponseTrace,
  ModelResult,
  StoredMessage,
} from "@/features/textChat/types";

export type ConfigResponse = {
  entra_auth_enabled: boolean;
  is_configured: boolean;
  endpoint: string | null;
  models: string[];
  is_realtime_configured: boolean;
  realtime_endpoint: string | null;
  realtime_model: string | null;
  embedding_model: string | null;
  is_document_rag_configured: boolean;
  search_endpoint: string | null;
  search_index_name: string | null;
  storage_account_url: string | null;
  storage_container_name: string | null;
  is_traditional_voice_configured: boolean;
  transcription_model: string | null;
  tts_model: string | null;
  tts_voice: string | null;
  is_speech_transcription_configured: boolean;
  speech_transcription_model: string | null;
  is_voice_live_configured: boolean;
  voice_live_model: string | null;
  voice_live_voice: string | null;
  is_live_interpreter_configured: boolean;
};

export type ModelsResponse = {
  models: string[];
  transcription_models?: string[];
  traditional_transcription_models?: string[];
  tts_models?: string[];
  model_modalities?: Record<string, ModelModality[]>;
  discovery_error: string | null;
};

export type ImageGenerationResult = {
  model: string;
  image_base64: string;
  mime_type: string;
  width: number;
  height: number;
  duration_ms: number;
  prompt: string;
};

export type AuthResponse = {
  authenticated: boolean;
  entra_auth_enabled: boolean;
  name?: string | null;
  email?: string | null;
  user_id?: string | null;
  identity_provider?: string | null;
};

export type ModelSettings = {
  model: string;
  api_surface: "responses" | "chat_completions";
  modalities: ModelModality[];
  system_prompt: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
  repetition_penalty: number;
  guardrail_policy_names: string[];
};

export type GuardrailPolicy = {
  id?: string | null;
  name: string;
  type: string;
  mode: string;
  base_policy_name?: string | null;
  content_filters: Array<{
    name: string;
    source: string;
    enabled: boolean;
    blocking: boolean;
    severity_threshold?: string | null;
  }>;
  is_selectable: boolean;
};

export type DeploymentGuardrailPolicy = {
  deployment_name: string;
  policy_name: string | null;
};

export type Theme = "light" | "dark";
export type ColorPalette = "foundry" | "ocean" | "forest" | "ember";
export type ViewMode = "chat" | "metrics" | "settings" | "model-settings";
export type ModelModality = "text" | "image" | "voice";

export type AdminConfig = {
  is_configured: boolean;
  subscription_id: string | null;
  resource_group: string | null;
  account_name: string | null;
  missing: string[];
};

export type AdminDeploymentDraft = {
  deployment_name: string;
  model_name: string;
  model_version: string;
  model_format: string;
  sku_name: string;
  sku_capacity: number;
  version_upgrade_option: string;
  rai_policy_name: string;
  wait_for_completion: boolean;
  api_surface: ModelSettings["api_surface"];
  modalities: ModelModality[];
};

export type StatusMessage = {
  type: "success" | "error";
  text: string;
};

export type ContextMenuState = {
  conversation: Conversation;
  x: number;
  y: number;
};

export type BrowserSpeechRecognitionResult = {
  isFinal: boolean;
  0: {
    transcript: string;
  };
};

export type BrowserSpeechRecognitionEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: BrowserSpeechRecognitionResult;
  };
};

export type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

export type MetricsDay = {
  date: string;
  label: string;
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  total_duration_ms: number;
  duration_count: number;
  avg_duration_ms: number;
};

export type ModelMetrics = {
  days: MetricsDay[];
  models: string[];
  summary: {
    requests: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost: number;
    avg_prompt_tokens: number;
    avg_completion_tokens: number;
    avg_total_tokens: number;
    avg_duration_ms: number;
  };
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
export type RealtimeStatus = "idle" | "connecting" | "live";
export type TraditionalVoiceStatus = "idle" | "recording" | "processing" | "complete";

export type RealtimeSessionResponse = {
  token: string;
  webrtc_url: string;
  model: string;
  voice: string;
  expires_at?: number | null;
  configured_guardrail_policy_name?: string | null;
  guardrail_status?: string;
};

export type RealtimeServerEvent = {
  type?: string;
  transcript?: string;
  delta?: string;
  error?: {
    message?: string;
  };
};

export type RealtimeTranscriptEntry = {
  id: string;
  source: "user" | "assistant" | "system";
  text: string;
};

export type TraditionalSpeechResult = {
  model: string;
  voice: string;
  audio_base64: string;
  audio_mime_type: string;
  duration_ms: number;
  spoken_transcript?: string | null;
  foundry_request?: { payload?: unknown };
  foundry_response?: { payload?: unknown };
};

export type TraditionalVoiceVariantResult = ModelResult & {
  assistant_message: StoredMessage;
  foundry_request?: FoundryRequestTrace;
  foundry_response?: FoundryResponseTrace;
  speech?: TraditionalSpeechResult;
  speech_error?: string;
};

export type TraditionalVoiceResult = {
  model: string;
  transcription: {
    model: string;
    text: string;
    duration_ms: number;
    foundry_request?: { payload?: unknown };
    foundry_response?: { extracted?: unknown; payload?: unknown };
  };
  chat?: ModelResult & {
    foundry_request?: FoundryRequestTrace;
    foundry_response?: FoundryResponseTrace;
  };
  speech?: TraditionalSpeechResult;
  results: TraditionalVoiceVariantResult[];
  conversation: Conversation;
  user_message: StoredMessage;
  assistant_message?: StoredMessage;
};

export type TranscriptionResult = {
  model: string;
  text: string;
  language: string;
  duration_ms: number;
  segments: string[];
};

export type VoiceLiveServerEvent = RealtimeServerEvent & {
  sdp_answer?: string;
};

export type LiveInterpreterServerEvent = {
  type: "ready" | "translation" | "audio_end" | "session_stopped" | "error";
  text?: string;
  detected_language?: string | null;
  target_language?: string;
  error?: string;
};

export type TracedFetchOptions = {
  label?: string;
  request?: unknown;
  responseKind?: "json" | "text" | "stream";
  traceResponse?: boolean;
};
