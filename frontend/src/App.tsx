import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUp,
  BarChart3,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronsUpDown,
  Clock,
  Copy,
  FileText,
  GitCompareArrows,
  HelpCircle,
  Infinity,
  LogIn,
  LogOut,
  Mic,
  MicOff,
  Moon,
  Network,
  Plus,
  RotateCcw,
  Rocket,
  Send,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Tags,
  Trash2,
  UploadCloud,
  User,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import type { UseCaseId } from "@/app/types";
import { useCaseModules } from "@/app/useCaseRegistry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UseCaseMarketplace } from "@/features/marketplace/UseCaseMarketplace";
import { SoundWaveIcon } from "@/features/shared/SoundWaveIcon";
import { UseCaseDetailsPanel } from "@/features/useCases/UseCaseDetailsPanel";
import { cn } from "@/lib/utils";

type ConfigResponse = {
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
};

type AuthResponse = {
  authenticated: boolean;
  entra_auth_enabled: boolean;
  name?: string | null;
  email?: string | null;
  user_id?: string | null;
  identity_provider?: string | null;
};

type Usage = {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
};

type ModelResult = {
  model: string;
  api_surface?: "responses" | "chat_completions";
  content?: string;
  duration_ms?: number;
  usage?: Usage;
  error?: string;
  guardrail_variant?: "baseline" | "guarded" | null;
  guardrail_policy_name?: string | null;
  guardrail_results?: Record<string, unknown> | null;
};

type ModelSettings = {
  model: string;
  api_surface: "responses" | "chat_completions";
  modalities: ModelModality[];
  system_prompt: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
  repetition_penalty: number;
  guardrails_enabled: boolean;
  guardrail_policy_name: string | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  model?: string;
  api_surface?: "responses" | "chat_completions";
  duration_ms?: number;
  usage?: Usage;
  error?: string;
  guardrail_variant?: "baseline" | "guarded" | null;
  guardrail_policy_name?: string | null;
  guardrail_results?: Record<string, unknown> | null;
};

type GuardrailPolicy = {
  id?: string | null;
  name: string;
  type: string;
  mode: string;
  base_policy_name?: string | null;
  is_selectable: boolean;
};

type DeploymentGuardrailPolicy = {
  deployment_name: string;
  policy_name: string | null;
};

type Theme = "light" | "dark";
type ViewMode = "chat" | "metrics" | "settings";
type ModelModality = "text" | "image" | "voice";
type ReasoningEffort = "default" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

type AdminConfig = {
  is_configured: boolean;
  subscription_id: string | null;
  resource_group: string | null;
  account_name: string | null;
  missing: string[];
};

type AdminDeploymentDraft = {
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

type StatusMessage = {
  type: "success" | "error";
  text: string;
};

type ContextMenuState = {
  conversation: Conversation;
  x: number;
  y: number;
};

type BrowserSpeechRecognitionResult = {
  isFinal: boolean;
  0: {
    transcript: string;
  };
};

type BrowserSpeechRecognitionEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: BrowserSpeechRecognitionResult;
  };
};

type BrowserSpeechRecognition = {
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

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type StoredMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  model: string | null;
  api_surface: "responses" | "chat_completions" | null;
  duration_ms: number | null;
  usage: Usage | null;
  error: string | null;
  guardrail_variant: "baseline" | "guarded" | null;
  guardrail_policy_name: string | null;
  guardrail_results: Record<string, unknown> | null;
  created_at: string;
};

type FoundryRequestTrace = {
  api_surface: string;
  method: "POST";
  path: string;
  payload: unknown;
};

type FoundryResponseTrace = {
  api_surface: string;
  payload?: unknown;
  events?: unknown[];
  extracted?: {
    content: string;
    usage: Usage;
  };
};

type DocumentSummary = {
  id: string;
  filename: string;
  content_type: string | null;
  byte_size: number;
  chunk_count: number;
  blob_name: string | null;
  blob_url: string | null;
  created_at: string;
};

type DocumentSource = {
  document_id: string;
  filename: string;
  chunk_index: number;
  content: string;
  score: number;
};

type MetricsDay = {
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

type ModelMetrics = {
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

type ChatStreamEvent =
  | {
      type: "start";
      model: string;
      api_surface: ModelSettings["api_surface"];
      conversation: Conversation;
      user_message: StoredMessage;
      guardrail_comparison?: boolean;
      guardrail_policy_name?: string | null;
    }
  | {
      type: "foundry_request";
      request: FoundryRequestTrace;
    }
  | {
      type: "foundry_response";
      response: FoundryResponseTrace;
    }
  | {
      type: "retrieval";
      sources: DocumentSource[];
      embedding: {
        model: string;
        duration_ms: number;
        dimensions: number;
        foundry_request?: FoundryRequestTrace;
        foundry_response?: FoundryResponseTrace;
      };
    }
  | {
      type: "delta";
      delta: string;
    }
  | {
      type: "completed";
      conversation: Conversation;
      assistant_message: StoredMessage;
    }
  | {
      type: "error";
      error: string;
      conversation?: Conversation;
      assistant_message?: StoredMessage;
    }
  | {
      type: "variant_completed";
      conversation: Conversation;
      result: ModelResult & {
        assistant_message: StoredMessage;
        foundry_request?: FoundryRequestTrace;
        foundry_response?: FoundryResponseTrace;
      };
    }
  | {
      type: "comparison_completed";
      conversation: Conversation;
    };

type ApiTraceEntry = {
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

type ApiTraceFilter = "all" | "messages";
type RealtimeStatus = "idle" | "connecting" | "live";
type TraditionalVoiceStatus = "idle" | "recording" | "processing" | "complete";

type RealtimeSessionResponse = {
  token: string;
  webrtc_url: string;
  model: string;
  voice: string;
  expires_at?: number | null;
  configured_guardrail_policy_name?: string | null;
  guardrail_status?: string;
};

type RealtimeServerEvent = {
  type?: string;
  transcript?: string;
  delta?: string;
  error?: {
    message?: string;
  };
};

type RealtimeTranscriptEntry = {
  id: string;
  source: "user" | "assistant" | "system";
  text: string;
};

type TraditionalSpeechResult = {
  model: string;
  voice: string;
  audio_base64: string;
  audio_mime_type: string;
  duration_ms: number;
  foundry_request?: { payload?: unknown };
  foundry_response?: { payload?: unknown };
};

type TraditionalVoiceVariantResult = ModelResult & {
  assistant_message: StoredMessage;
  foundry_request?: FoundryRequestTrace;
  foundry_response?: FoundryResponseTrace;
  speech?: TraditionalSpeechResult;
  speech_error?: string;
};

type TraditionalVoiceResult = {
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

type TracedFetchOptions = {
  label?: string;
  request?: unknown;
  responseKind?: "json" | "text" | "stream";
  traceResponse?: boolean;
};

const defaultSettings: Omit<ModelSettings, "model"> = {
  api_surface: "responses",
  modalities: ["text"],
  system_prompt: "You are a concise, helpful assistant.",
  temperature: 0.7,
  top_p: 1,
  max_tokens: 1024,
  repetition_penalty: 1,
  guardrails_enabled: false,
  guardrail_policy_name: null,
};

const defaultDeploymentDraft: AdminDeploymentDraft = {
  deployment_name: "",
  model_name: "",
  model_version: "",
  model_format: "OpenAI",
  sku_name: "Standard",
  sku_capacity: 1,
  version_upgrade_option: "OnceNewDefaultVersionAvailable",
  rai_policy_name: "",
  wait_for_completion: false,
  api_surface: "responses",
  modalities: ["text"],
};

const modelModalities: ModelModality[] = ["text", "image", "voice"];
const reasoningEffortOptions: Array<{ value: ReasoningEffort; label: string }> = [
  { value: "default", label: "Default" },
  { value: "none", label: "None" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra-high" },
];
const voiceReadbackStorageKey = "foundry-chat-voice-readback";
const voiceModelStorageKey = "foundry-chat-voice-model";
const speechVoiceStorageKey = "foundry-chat-speech-voice-uri";

export default function App() {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [activeModel, setActiveModel] = useState("");
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [newModel, setNewModel] = useState("");
  const [modelEndpointMessage, setModelEndpointMessage] = useState<StatusMessage | null>(null);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [activeUseCase, setActiveUseCase] = useState<UseCaseId>("text_chat");
  const [useCaseMarketplaceOpen, setUseCaseMarketplaceOpen] = useState(false);
  const [useCaseDetailsOpen, setUseCaseDetailsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("default");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [conversationsOpen, setConversationsOpen] = useState(false);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentMessage, setDocumentMessage] = useState<StatusMessage | null>(null);
  const documentFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [settingsModel, setSettingsModel] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<ModelSettings | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [guardrailPolicies, setGuardrailPolicies] = useState<GuardrailPolicy[]>([]);
  const [deploymentGuardrailPolicy, setDeploymentGuardrailPolicy] =
    useState<DeploymentGuardrailPolicy | null>(null);
  const [guardrailPoliciesLoading, setGuardrailPoliciesLoading] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [conversationMenu, setConversationMenu] = useState<ContextMenuState | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminConfig, setAdminConfig] = useState<AdminConfig | null>(null);
  const [deploymentDraft, setDeploymentDraft] =
    useState<AdminDeploymentDraft>(defaultDeploymentDraft);
  const [isDeploying, setIsDeploying] = useState(false);
  const [adminMessage, setAdminMessage] = useState<StatusMessage | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const [speechRecognitionSupported, setSpeechRecognitionSupported] = useState(false);
  const [speechSynthesisSupported, setSpeechSynthesisSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [voiceReadbackEnabled, setVoiceReadbackEnabled] = useState(
    () => localStorage.getItem(voiceReadbackStorageKey) === "true",
  );
  const [selectedVoiceModel, setSelectedVoiceModel] = useState(
    () => localStorage.getItem(voiceModelStorageKey) ?? "",
  );
  const [availableSpeechVoices, setAvailableSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedSpeechVoiceURI, setSelectedSpeechVoiceURI] = useState(
    () => localStorage.getItem(speechVoiceStorageKey) ?? "",
  );
  const realtimePeerRef = useRef<RTCPeerConnection | null>(null);
  const realtimeDataChannelRef = useRef<RTCDataChannel | null>(null);
  const realtimeMediaStreamRef = useRef<MediaStream | null>(null);
  const realtimeAudioRef = useRef<HTMLAudioElement | null>(null);
  const realtimeTranscriptSequence = useRef(0);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("idle");
  const [realtimeError, setRealtimeError] = useState("");
  const [realtimeTranscript, setRealtimeTranscript] = useState<RealtimeTranscriptEntry[]>([]);
  const [realtimeSessionModel, setRealtimeSessionModel] = useState<string | null>(null);
  const [realtimeGuardrailStatus, setRealtimeGuardrailStatus] = useState("");
  const traditionalMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const traditionalMediaStreamRef = useRef<MediaStream | null>(null);
  const traditionalAudioChunksRef = useRef<Blob[]>([]);
  const [traditionalVoiceStatus, setTraditionalVoiceStatus] =
    useState<TraditionalVoiceStatus>("idle");
  const [traditionalVoiceError, setTraditionalVoiceError] = useState("");
  const [traditionalVoiceResult, setTraditionalVoiceResult] =
    useState<TraditionalVoiceResult | null>(null);
  const [traditionalAudioUrl, setTraditionalAudioUrl] = useState("");
  const traditionalAudioUrlRef = useRef("");
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem("foundry-chat-theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      return savedTheme;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [activeView, setActiveView] = useState<ViewMode>("chat");
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [metricsDays, setMetricsDays] = useState(7);
  const [metricsModel, setMetricsModel] = useState("");
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState("");
  const [apiTraceOpen, setApiTraceOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDetailsElement | null>(null);
  const [apiTraceFilter, setApiTraceFilter] = useState<ApiTraceFilter>("all");
  const [apiTraceEntries, setApiTraceEntries] = useState<ApiTraceEntry[]>([]);
  const apiTraceSequence = useRef(0);
  const entraAuthEnabled = config?.entra_auth_enabled ?? auth?.entra_auth_enabled ?? false;
  const canUseProtectedApis = entraAuthEnabled ? auth?.authenticated === true : config !== null;
  const authGateActive = auth === null || (entraAuthEnabled && auth.authenticated !== true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("foundry-chat-theme", theme);
  }, [theme]);

  useEffect(() => {
    tracedFetch("/api/config", {}, { label: "Load Foundry config", responseKind: "json" })
      .then((response) => response.json())
      .then((data: ConfigResponse) => {
        const configuredModels = data.models.length ? data.models : ["gpt-4o-mini"];
        setConfig(data);
        setModels(configuredModels);
        setActiveModel(configuredModels[0]);
        setSelectedModels(new Set(configuredModels));
        setSelectedVoiceModel((current) =>
          current && configuredModels.includes(current) ? current : configuredModels[0],
        );
      })
      .catch((error: Error) => {
        setConfig({
          is_configured: false,
          entra_auth_enabled: false,
          endpoint: error.message,
          models: [],
          is_realtime_configured: false,
          realtime_endpoint: null,
          realtime_model: null,
          embedding_model: null,
          is_document_rag_configured: false,
          search_endpoint: null,
          search_index_name: null,
          storage_account_url: null,
          storage_container_name: null,
          is_traditional_voice_configured: false,
          transcription_model: null,
          tts_model: null,
          tts_voice: null,
        });
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { signal: controller.signal })
      .then((response) =>
        response.ok
          ? response.json()
          : ({ authenticated: false, entra_auth_enabled: false } satisfies AuthResponse),
      )
      .then((data: AuthResponse) => setAuth(data))
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setAuth({ authenticated: false, entra_auth_enabled: false });
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!canUseProtectedApis) {
      setConversations([]);
      return;
    }
    void refreshConversations();
  }, [canUseProtectedApis]);

  useEffect(() => {
    if (!canUseProtectedApis) {
      setDocuments([]);
      return;
    }
    if (activeUseCase === "document_qa" && config?.is_document_rag_configured) {
      void refreshDocuments();
    }
  }, [activeUseCase, canUseProtectedApis, config?.is_document_rag_configured]);

  useEffect(() => {
    if (activeView !== "metrics" || !canUseProtectedApis) {
      return;
    }

    const controller = new AbortController();
    void refreshMetrics(controller.signal);
    return () => controller.abort();
  }, [activeView, canUseProtectedApis, metricsDays, metricsModel]);

  useEffect(() => {
    if (!conversationMenu) {
      return;
    }

    const closeMenu = () => setConversationMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", closeMenu);
    };
  }, [conversationMenu]);

  useEffect(() => {
    let cleanupSpeechVoices: (() => void) | undefined;
    if ("speechSynthesis" in window) {
      const refreshSpeechVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        setAvailableSpeechVoices(voices);
        setSelectedSpeechVoiceURI((current) => {
          if (current && voices.some((voice) => voice.voiceURI === current)) {
            return current;
          }
          return voices.find((voice) => voice.default)?.voiceURI ?? voices[0]?.voiceURI ?? "";
        });
      };
      setSpeechSynthesisSupported(true);
      refreshSpeechVoices();
      window.speechSynthesis.addEventListener("voiceschanged", refreshSpeechVoices);
      cleanupSpeechVoices = () =>
        window.speechSynthesis.removeEventListener("voiceschanged", refreshSpeechVoices);
    } else {
      setSpeechSynthesisSupported(false);
      setAvailableSpeechVoices([]);
    }

    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechRecognitionSupported(false);
      return cleanupSpeechVoices;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      let finalTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        }
      }

      if (finalTranscript.trim()) {
        setPrompt((current) => {
          const spacer = current && !current.endsWith(" ") ? " " : "";
          return `${current}${spacer}${finalTranscript.trim()}`;
        });
      }
    };
    recognition.onerror = () => {
      setVoiceError("Voice dictation stopped. Check microphone permissions.");
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    setSpeechRecognitionSupported(true);

    return () => {
      cleanupSpeechVoices?.();
      recognition.abort();
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(voiceReadbackStorageKey, String(voiceReadbackEnabled));
    if (!voiceReadbackEnabled && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, [voiceReadbackEnabled]);

  useEffect(() => {
    if (selectedVoiceModel) {
      localStorage.setItem(voiceModelStorageKey, selectedVoiceModel);
    } else {
      localStorage.removeItem(voiceModelStorageKey);
    }
  }, [selectedVoiceModel]);

  useEffect(() => {
    if (selectedSpeechVoiceURI) {
      localStorage.setItem(speechVoiceStorageKey, selectedSpeechVoiceURI);
    } else {
      localStorage.removeItem(speechVoiceStorageKey);
    }
  }, [selectedSpeechVoiceURI]);

  useEffect(() => {
    setSelectedVoiceModel((current) =>
      current && models.includes(current) ? current : models[0] ?? "",
    );
  }, [models]);

  useEffect(
    () => () => {
      closeRealtimeConnection();
      closeTraditionalRecording();
      if (traditionalAudioUrlRef.current) {
        URL.revokeObjectURL(traditionalAudioUrlRef.current);
      }
    },
    [],
  );

  const selected = useMemo(
    () => models.filter((model) => selectedModels.has(model)),
    [models, selectedModels],
  );
  const activeUseCaseDetails = useMemo(
    () => useCaseModules.find((useCase) => useCase.id === activeUseCase) ?? useCaseModules[0],
    [activeUseCase],
  );

  function createApiTraceEntry(entry: Omit<ApiTraceEntry, "id" | "timestamp">) {
    apiTraceSequence.current += 1;
    return {
      ...entry,
      id: `trace-${apiTraceSequence.current}`,
      timestamp: new Date().toISOString(),
    };
  }

  function appendApiTrace(entry: Omit<ApiTraceEntry, "id" | "timestamp">) {
    const tracedEntry = createApiTraceEntry(entry);
    setApiTraceEntries((current) =>
      [
        ...current,
        tracedEntry,
      ].slice(-100),
    );
    return tracedEntry.id;
  }

  function insertApiTraceAfter(afterId: string, entry: Omit<ApiTraceEntry, "id" | "timestamp">) {
    const tracedEntry = createApiTraceEntry(entry);
    setApiTraceEntries((current) => {
      const index = current.findIndex((item) => item.id === afterId);
      if (index === -1) {
        return [...current, tracedEntry].slice(-100);
      }
      return [
        ...current.slice(0, index + 1),
        tracedEntry,
        ...current.slice(index + 1),
      ].slice(-100);
    });
    return tracedEntry.id;
  }

  function updateApiTrace(id: string, patch: Partial<ApiTraceEntry>) {
    setApiTraceEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
  }

  function appendFoundryTrace(request: FoundryRequestTrace, label?: string) {
    appendApiTrace({
      direction: "api_foundry",
      label: label ?? `Foundry ${formatApiSurface(request.api_surface)}`,
      method: request.method,
      url: request.path,
      request: request.payload,
    });
  }

  function appendFoundryResponseTrace(response: FoundryResponseTrace, label?: string) {
    appendApiTrace({
      direction: "foundry_api",
      label: label ?? `Foundry ${formatApiSurface(response.api_surface)} response`,
      method: "RECV",
      url: response.events ? "stream" : "response",
      response: response.events ?? response.payload,
    });
  }

  function appendApiResponseTrace({
    label,
    method,
    url,
    status,
    durationMs,
    response,
    afterId,
  }: {
    label: string;
    method: string;
    url: string;
    status?: number;
    durationMs?: number;
    response: unknown;
    afterId?: string;
  }) {
    const entry = {
      direction: "api_frontend",
      label,
      method,
      url,
      status,
      durationMs,
      response,
    } satisfies Omit<ApiTraceEntry, "id" | "timestamp">;
    if (afterId) {
      insertApiTraceAfter(afterId, entry);
      return;
    }
    appendApiTrace(entry);
  }

  async function tracedFetch(
    url: string,
    init: RequestInit = {},
    options: TracedFetchOptions = {},
  ) {
    const method = (init.method ?? "GET").toUpperCase();
    const request = options.request ?? parseRequestBody(init.body);
    const traceId = appendApiTrace({
      direction: "frontend_api",
      label: options.label ?? `${method} ${url}`,
      method,
      url,
      request,
    });
    const started = performance.now();
    try {
      const response = await fetch(url, init);
      const durationMs = Math.round(performance.now() - started);
      const responsePayload = await readTraceResponse(response, options.responseKind);
      updateApiTrace(traceId, {
        status: response.status,
        durationMs,
      });
      if (options.responseKind !== "stream" && options.traceResponse !== false) {
        appendApiResponseTrace({
          label: `${options.label ?? `${method} ${url}`} response`,
          method: "RECV",
          url,
          status: response.status,
          durationMs,
          response: responsePayload,
          afterId: traceId,
        });
      }
      return response;
    } catch (error) {
      updateApiTrace(traceId, {
        durationMs: Math.round(performance.now() - started),
        error: error instanceof Error ? error.message : "Request failed",
      });
      throw error;
    }
  }

  async function addModel() {
    const model = newModel.trim();
    setModelEndpointMessage(null);
    if (!model) {
      return;
    }
    if (models.some((item) => item.toLowerCase() === model.toLowerCase())) {
      setModelEndpointMessage({ type: "error", text: `${model} is already in the model list.` });
      return;
    }

    const request = { model };
    const response = await tracedFetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }, { label: "Register model endpoint", request, responseKind: "json" });
    const data = await response.json();
    if (!response.ok) {
      setModelEndpointMessage({ type: "error", text: data.detail ?? "Failed to save model endpoint." });
      return;
    }

    const deploymentName = data.settings.model as string;
    const nextModels = (data.models as string[] | undefined) ?? [
      ...models,
      deploymentName,
    ];
    setModels(nextModels);
    setActiveModel(deploymentName);
    setSelectedModels((current) => new Set([...current, deploymentName]));
    setNewModel("");
    setModelEndpointMessage({
      type: "success",
      text: `Saved ${deploymentName} to the local model registry.`,
    });
  }

  function toggleModel(model: string) {
    setSelectedModels((current) => {
      const next = new Set(current);
      if (next.has(model)) {
        next.delete(model);
      } else {
        next.add(model);
      }
      return next;
    });
  }

  function replaceComparisonModel(currentModel: string, nextModel: string) {
    if (currentModel === nextModel) {
      return;
    }

    setSelectedModels((current) => {
      const next = new Set(current);
      next.delete(currentModel);
      next.add(nextModel);
      return next;
    });
  }

  async function openSettings(model: string) {
    if (!model) {
      return;
    }

    setSettingsModel(model);
    setSettingsDraft(null);
    setSettingsError("");
    setGuardrailPoliciesLoading(true);
    setDeploymentGuardrailPolicy(null);
    try {
      const [settingsResponse, policiesResponse, deploymentPolicyResponse] = await Promise.all([
        tracedFetch(
          `/api/model-settings?model=${encodeURIComponent(model)}`,
          {},
          { label: "Load model settings", responseKind: "json" },
        ),
        tracedFetch(
          "/api/guardrails/policies",
          {},
          { label: "List Foundry guardrails", responseKind: "json" },
        ),
        tracedFetch(
          `/api/guardrails/deployment-policy?model=${encodeURIComponent(model)}`,
          {},
          { label: "Load deployment guardrail", responseKind: "json" },
        ),
      ]);
      const [settingsData, policiesData, deploymentPolicyData] = await Promise.all([
        settingsResponse.json(),
        policiesResponse.json(),
        deploymentPolicyResponse.json(),
      ]);
      if (!settingsResponse.ok) {
        throw new Error(settingsData.detail ?? "Failed to load model settings.");
      }
      setSettingsDraft(settingsData);
      if (!policiesResponse.ok) {
        setGuardrailPolicies([]);
        setSettingsError(policiesData.detail ?? "Failed to retrieve Foundry guardrails.");
      } else {
        setGuardrailPolicies(policiesData.policies ?? []);
      }
      if (!deploymentPolicyResponse.ok) {
        setSettingsError(
          deploymentPolicyData.detail ?? "Failed to retrieve the deployment guardrail.",
        );
      } else {
        setDeploymentGuardrailPolicy(deploymentPolicyData);
      }
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Failed to load settings.");
    } finally {
      setGuardrailPoliciesLoading(false);
    }
  }

  async function refreshConversations() {
    const response = await tracedFetch(
      "/api/conversations",
      {},
      { label: "List conversations", responseKind: "json" },
    );
    const data = await response.json();
    setConversations(data.conversations ?? []);
  }

  async function refreshDocuments() {
    setDocumentsLoading(true);
    setDocumentMessage(null);
    try {
      const response = await tracedFetch(
        "/api/documents",
        {},
        { label: "List RAG documents", responseKind: "json" },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? "Failed to load documents.");
      }
      setDocuments((current) => [
        ...(data.documents ?? []),
        ...current.filter(
          (document) =>
            !(data.documents ?? []).some((uploaded: DocumentSummary) => uploaded.id === document.id),
        ),
      ]);
    } catch (error) {
      setDocumentMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to load documents.",
      });
    } finally {
      setDocumentsLoading(false);
    }
  }

  async function uploadDocuments(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    const formData = new FormData();
    const fileSummaries = Array.from(files).map((file) => ({
      name: file.name,
      type: file.type || "application/octet-stream",
      bytes: file.size,
    }));
    Array.from(files).forEach((file) => formData.append("files", file));
    setDocumentsLoading(true);
    setDocumentMessage(null);
    try {
      const response = await tracedFetch("/api/documents", {
        method: "POST",
        body: formData,
      }, {
        label: "Upload RAG documents",
        request: { files: fileSummaries },
        responseKind: "json",
        traceResponse: false,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? "Failed to upload documents.");
      }
      for (const trace of data.embedding_traces ?? []) {
        if (trace.foundry_request) {
          appendFoundryTrace(trace.foundry_request, `Foundry embeddings for uploaded documents`);
        }
        if (trace.foundry_response) {
          appendFoundryResponseTrace(trace.foundry_response, "Foundry embeddings response");
        }
      }
      appendApiResponseTrace({
        label: "Upload RAG documents response",
        method: "RECV",
        url: "/api/documents",
        status: response.status,
        response: data,
      });
      setDocuments(data.documents ?? []);
      setDocumentMessage({
        type: "success",
        text: `Indexed ${(data.documents ?? []).length} document${(data.documents ?? []).length === 1 ? "" : "s"} in Azure AI Search.`,
      });
    } catch (error) {
      setDocumentMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to upload documents.",
      });
    } finally {
      setDocumentsLoading(false);
      if (documentFileInputRef.current) {
        documentFileInputRef.current.value = "";
      }
    }
  }

  async function deleteRagDocument(document: DocumentSummary) {
    setDocumentsLoading(true);
    setDocumentMessage(null);
    try {
      const response = await tracedFetch(`/api/documents/${document.id}`, {
        method: "DELETE",
      }, { label: "Delete RAG document", responseKind: "json" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? "Failed to delete document.");
      }
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setDocumentMessage({ type: "success", text: `Removed ${document.filename} from Azure AI Search.` });
    } catch (error) {
      setDocumentMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to delete document.",
      });
    } finally {
      setDocumentsLoading(false);
    }
  }

  async function startNewChat() {
    setConversationsOpen(false);
    setActiveView("chat");
    setCurrentConversationId(null);
    setMessages([]);
    setPrompt("");
  }

  function selectUseCase(useCase: UseCaseId) {
    const nextUseCase = useCaseModules.find((module) => module.id === useCase) ?? useCaseModules[0];
    setActiveUseCase(useCase);
    setActiveView("chat");
    setUseCaseMarketplaceOpen(false);
    setComparisonMode(nextUseCase.workspace === "comparison");
    if (!nextUseCase.enableComposerDictation && isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }
    if (nextUseCase.workspace !== "realtimeVoice" && realtimeStatus !== "idle") {
      stopRealtimeSession();
    }
    if (nextUseCase.workspace !== "traditionalVoice" && traditionalVoiceStatus === "recording") {
      stopTraditionalRecording();
    }
    if (useCase === "document_qa" && config?.is_document_rag_configured) {
      void refreshDocuments();
    }
  }

  async function loadConversation(conversationId: string) {
    const response = await tracedFetch(
      `/api/conversations/${conversationId}`,
      {},
      { label: "Load conversation", responseKind: "json" },
    );
    const data = await response.json();
    setConversationsOpen(false);
    setActiveView("chat");
    setCurrentConversationId(data.conversation.id);
    setMessages((data.messages ?? []).map(mapStoredMessage));
    setConversationMenu(null);
  }

  async function refreshMetrics(signal?: AbortSignal) {
    setMetricsLoading(true);
    setMetricsError("");
    try {
      const params = new URLSearchParams({ days: String(metricsDays) });
      if (metricsModel) {
        params.set("model", metricsModel);
      }
      const response = await tracedFetch(
        `/api/metrics/model?${params.toString()}`,
        { signal },
        { label: "Load model metrics", responseKind: "json" },
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail ?? "Failed to load model metrics.");
      }
      const data = await response.json();
      setMetrics(data);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setMetricsError(error instanceof Error ? error.message : "Failed to load model metrics.");
    } finally {
      if (!signal?.aborted) {
        setMetricsLoading(false);
      }
    }
  }

  async function deleteConversationById(conversation: Conversation) {
    setConversationMenu(null);
    const confirmed = window.confirm(`Delete "${conversation.title}"?`);
    if (!confirmed) {
      return;
    }

    const response = await tracedFetch(`/api/conversations/${conversation.id}`, {
      method: "DELETE",
    }, { label: "Delete conversation", responseKind: "json" });
    if (!response.ok) {
      return;
    }

    setConversations((current) => current.filter((item) => item.id !== conversation.id));
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

  function toggleDictation() {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setVoiceError("Voice dictation is not supported in this browser.");
      return;
    }

    setVoiceError("");
    if (isListening) {
      recognition.stop();
      setIsListening(false);
      return;
    }

    try {
      if (selectedVoiceModel && !comparisonMode) {
        setActiveModel(selectedVoiceModel);
      }
      recognition.start();
      setIsListening(true);
    } catch {
      setVoiceError("Voice dictation is already starting. Try again in a moment.");
    }
  }

  function toggleReadback() {
    setVoiceReadbackEnabled((enabled) => !enabled);
  }

  function changeVoiceModel(model: string) {
    setSelectedVoiceModel(model);
    if (!comparisonMode) {
      setActiveModel(model);
    }
  }

  function speakResponses(responses: StoredMessage[]) {
    if (!voiceReadbackEnabled || !speechSynthesisSupported) {
      return;
    }

    const selectedSpeechVoice = availableSpeechVoices.find(
      (voice) => voice.voiceURI === selectedSpeechVoiceURI,
    );
    window.speechSynthesis.cancel();
    for (const response of responses) {
      if (response.error || !response.content.trim()) {
        continue;
      }
      const prefix = response.model ? `${response.model}. ` : "";
      const utterance = new SpeechSynthesisUtterance(`${prefix}${response.content}`);
      if (selectedSpeechVoice) {
        utterance.voice = selectedSpeechVoice;
      }
      utterance.rate = 1;
      window.speechSynthesis.speak(utterance);
    }
  }

  function replaceTraditionalAudioUrl(url: string) {
    if (traditionalAudioUrlRef.current) {
      URL.revokeObjectURL(traditionalAudioUrlRef.current);
    }
    traditionalAudioUrlRef.current = url;
    setTraditionalAudioUrl(url);
  }

  function closeTraditionalRecording() {
    traditionalMediaRecorderRef.current = null;
    traditionalMediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    traditionalMediaStreamRef.current = null;
  }

  function stopTraditionalRecording() {
    const recorder = traditionalMediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  async function startTraditionalRecording() {
    if (traditionalVoiceStatus === "recording") {
      stopTraditionalRecording();
      return;
    }
    if (traditionalVoiceStatus === "processing") {
      return;
    }
    if (!activeModel) {
      setTraditionalVoiceError("Select a chat model for the middle step of the STT -> Chat -> TTS pipeline.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setTraditionalVoiceError("This browser does not support audio recording with MediaRecorder.");
      return;
    }

    setTraditionalVoiceError("");
    setTraditionalVoiceResult(null);
    replaceTraditionalAudioUrl("");
    traditionalAudioChunksRef.current = [];

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      traditionalMediaStreamRef.current = mediaStream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = new MediaRecorder(
        mediaStream,
        mimeType ? { mimeType } : undefined,
      );
      traditionalMediaRecorderRef.current = recorder;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          traditionalAudioChunksRef.current.push(event.data);
        }
      });
      recorder.addEventListener("error", () => {
        closeTraditionalRecording();
        setTraditionalVoiceStatus("idle");
        setTraditionalVoiceError("Audio recording failed. Check microphone permissions and try again.");
      });
      recorder.addEventListener("stop", () => {
        const chunks = traditionalAudioChunksRef.current;
        traditionalAudioChunksRef.current = [];
        closeTraditionalRecording();
        if (!chunks.length) {
          setTraditionalVoiceStatus("idle");
          setTraditionalVoiceError("No audio was captured.");
          return;
        }
        const audioBlob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        void runTraditionalVoicePipeline(audioBlob);
      });

      recorder.start();
      setTraditionalVoiceStatus("recording");
    } catch (error) {
      closeTraditionalRecording();
      setTraditionalVoiceStatus("idle");
      setTraditionalVoiceError(
        error instanceof Error ? error.message : "Failed to start microphone recording.",
      );
    }
  }

  async function runTraditionalVoicePipeline(audioBlob: Blob) {
    const requestSummary = {
      model: activeModel,
      conversation_id: currentConversationId,
      reasoning_effort: reasoningEffort === "default" ? null : reasoningEffort,
      audio: {
        type: audioBlob.type || "audio/webm",
        bytes: audioBlob.size,
      },
    };
    const formData = new FormData();
    formData.append("audio", audioBlob, "foundry-voice-demo.webm");
    formData.append("model", activeModel);
    if (currentConversationId) {
      formData.append("conversation_id", currentConversationId);
    }
    if (reasoningEffort !== "default") {
      formData.append("reasoning_effort", reasoningEffort);
    }

    setTraditionalVoiceStatus("processing");
    setTraditionalVoiceError("");
    try {
      const response = await tracedFetch("/api/voice/traditional", {
        method: "POST",
        body: formData,
      }, {
        label: "Run traditional voice pipeline",
        request: requestSummary,
        responseKind: "json",
        traceResponse: false,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? "Traditional Foundry voice pipeline failed.");
      }
      if (data.error) {
        throw new Error(data.error);
      }
      const result = data as TraditionalVoiceResult;

      appendAudioPipelineTrace(result);
      appendApiResponseTrace({
        label: "Traditional voice pipeline response",
        method: "RECV",
        url: "/api/voice/traditional",
        status: response.status,
        response: summarizeTraditionalVoiceResult(result),
      });

      const primarySpeech = result.results.length === 1 ? result.results[0].speech : undefined;
      const audioUrl = primarySpeech
        ? URL.createObjectURL(
            base64ToBlob(primarySpeech.audio_base64, primarySpeech.audio_mime_type),
          )
        : "";
      replaceTraditionalAudioUrl(audioUrl);
      setTraditionalVoiceResult(result);
      setTraditionalVoiceStatus("complete");
      setCurrentConversationId(result.conversation.id);
      upsertConversation(result.conversation);
      setMessages((current) => [
        ...current,
        mapStoredMessage(result.user_message),
        ...result.results.map((variant) => mapStoredMessage(variant.assistant_message)),
      ]);
      if (audioUrl) {
        void new Audio(audioUrl).play();
      }
    } catch (error) {
      setTraditionalVoiceStatus("idle");
      setTraditionalVoiceError(
        error instanceof Error ? error.message : "Traditional Foundry voice pipeline failed.",
      );
    }
  }

  function appendAudioPipelineTrace(result: TraditionalVoiceResult) {
    appendApiTrace({
      direction: "api_foundry",
      label: `Foundry transcription (${result.transcription.model})`,
      method: "POST",
      url: "/audio/transcriptions",
      request: result.transcription.foundry_request?.payload,
    });
    appendApiTrace({
      direction: "foundry_api",
      label: "Foundry transcription response",
      method: "RECV",
      url: "/audio/transcriptions",
      durationMs: result.transcription.duration_ms,
      response: result.transcription.foundry_response?.extracted,
    });
    for (const variant of result.results) {
      const variantLabel = variant.guardrail_variant ?? "standard";
      if (variant.foundry_request) {
        appendFoundryTrace(
          variant.foundry_request,
          `Foundry ${variantLabel} chat request for ${result.model}`,
        );
      }
      if (variant.foundry_response) {
        appendFoundryResponseTrace(
          variant.foundry_response,
          `Foundry ${variantLabel} chat response for ${result.model}`,
        );
      }
      if (variant.speech) {
        appendApiTrace({
          direction: "api_foundry",
          label: `Foundry ${variantLabel} speech (${variant.speech.model})`,
          method: "POST",
          url: "/audio/speech",
          request: variant.speech.foundry_request?.payload,
        });
        appendApiTrace({
          direction: "foundry_api",
          label: `Foundry ${variantLabel} speech response`,
          method: "RECV",
          url: "/audio/speech",
          durationMs: variant.speech.duration_ms,
          response: variant.speech.foundry_response?.payload,
        });
      }
    }
  }

  function closeRealtimeConnection() {
    realtimeDataChannelRef.current?.close();
    realtimeDataChannelRef.current = null;
    realtimePeerRef.current?.getSenders().forEach((sender) => sender.track?.stop());
    realtimePeerRef.current?.close();
    realtimePeerRef.current = null;
    realtimeMediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    realtimeMediaStreamRef.current = null;
    if (realtimeAudioRef.current) {
      realtimeAudioRef.current.pause();
      realtimeAudioRef.current.srcObject = null;
      realtimeAudioRef.current = null;
    }
  }

  function appendRealtimeTranscript(source: RealtimeTranscriptEntry["source"], text: string) {
    const cleaned = text.trim();
    if (!cleaned) {
      return;
    }
    realtimeTranscriptSequence.current += 1;
    setRealtimeTranscript((current) =>
      [
        ...current,
        {
          id: `realtime-${realtimeTranscriptSequence.current}`,
          source,
          text: cleaned,
        },
      ].slice(-8),
    );
  }

  function handleRealtimeServerEvent(event: RealtimeServerEvent) {
    if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) {
      appendRealtimeTranscript("user", event.transcript);
      return;
    }
    if (
      (event.type === "response.output_audio_transcript.done" ||
        event.type === "response.output_text.done") &&
      event.transcript
    ) {
      appendRealtimeTranscript("assistant", event.transcript);
      return;
    }
    if (
      (event.type === "response.output_audio_transcript.delta" ||
        event.type === "response.output_text.delta") &&
      event.delta
    ) {
      appendRealtimeTranscript("assistant", event.delta);
      return;
    }
    if (event.type === "input_audio_buffer.speech_started") {
      appendRealtimeTranscript("system", "Speech detected");
      return;
    }
    if (event.type === "output_audio_buffer.started") {
      appendRealtimeTranscript("system", "Foundry is responding");
      return;
    }
    if (event.type === "error" || event.type === "session.error") {
      setRealtimeError(event.error?.message ?? "Realtime session reported an error.");
    }
  }

  function stopRealtimeSession() {
    closeRealtimeConnection();
    setRealtimeStatus("idle");
    setRealtimeSessionModel(null);
    setRealtimeGuardrailStatus("");
    appendRealtimeTranscript("system", "Realtime session stopped");
  }

  async function startRealtimeSession() {
    if (realtimeStatus !== "idle") {
      stopRealtimeSession();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      setRealtimeError("This browser does not support the WebRTC APIs required for Foundry Realtime.");
      return;
    }

    const model = config?.realtime_model ?? "gpt-realtime-2.1";
    const requestBody = {
      model,
      voice: "alloy",
      instructions:
        "You are a friendly Microsoft Foundry voice demo assistant. Keep answers concise, conversational, and suitable for a live customer demo.",
    };
    setRealtimeStatus("connecting");
    setRealtimeError("");
    setRealtimeTranscript([]);
    setRealtimeSessionModel(model);

    try {
      const tokenResponse = await tracedFetch("/api/realtime/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }, {
        label: "Create realtime voice session",
        request: requestBody,
        responseKind: "json",
        traceResponse: false,
      });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) {
        throw new Error(tokenData.detail ?? "Failed to create a Foundry Realtime session.");
      }
      const session = tokenData as RealtimeSessionResponse;
      setRealtimeGuardrailStatus(
        session.configured_guardrail_policy_name
          ? `${session.configured_guardrail_policy_name}: ${session.guardrail_status}`
          : session.guardrail_status ?? "",
      );

      const audioElement = new Audio();
      audioElement.autoplay = true;
      realtimeAudioRef.current = audioElement;

      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      realtimeMediaStreamRef.current = mediaStream;

      const peerConnection = new RTCPeerConnection();
      realtimePeerRef.current = peerConnection;
      peerConnection.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream && realtimeAudioRef.current) {
          realtimeAudioRef.current.srcObject = remoteStream;
          void realtimeAudioRef.current.play();
        }
      };
      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === "failed") {
          setRealtimeError("Foundry Realtime WebRTC connection failed.");
          stopRealtimeSession();
        }
      };

      mediaStream.getTracks().forEach((track) => peerConnection.addTrack(track, mediaStream));

      const dataChannel = peerConnection.createDataChannel("realtime-channel");
      realtimeDataChannelRef.current = dataChannel;
      dataChannel.addEventListener("open", () => {
        setRealtimeStatus("live");
        setRealtimeSessionModel(session.model);
        appendRealtimeTranscript("system", `Connected to ${session.model} (${session.voice})`);
      });
      dataChannel.addEventListener("message", (event) => {
        try {
          handleRealtimeServerEvent(JSON.parse(event.data) as RealtimeServerEvent);
        } catch {
          setRealtimeError("Received an unreadable Realtime event.");
        }
      });
      dataChannel.addEventListener("close", () => {
        setRealtimeStatus("idle");
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      if (!offer.sdp) {
        throw new Error("Browser did not create an SDP offer for the Realtime session.");
      }

      const sdpResponse = await fetch(session.webrtc_url, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpResponse.ok) {
        throw new Error(`Realtime SDP exchange failed: ${await sdpResponse.text()}`);
      }
      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: await sdpResponse.text(),
      });
    } catch (error) {
      closeRealtimeConnection();
      setRealtimeStatus("idle");
      setRealtimeError(
        error instanceof Error ? error.message : "Failed to start Foundry Realtime voice demo.",
      );
    }
  }

  async function saveSettings() {
    if (!settingsDraft) {
      return;
    }

    setIsSavingSettings(true);
    setSettingsError("");
    try {
      const response = await tracedFetch("/api/model-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsDraft),
      }, { label: "Save model settings", request: settingsDraft, responseKind: "json" });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail ?? "Failed to save settings.");
      }

      const saved = await response.json();
      setSettingsDraft(saved);
      setSettingsModel(null);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Failed to save settings.");
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function openAdmin() {
    setAdminOpen(true);
    setAdminMessage(null);
    const response = await tracedFetch(
      "/api/admin/deployments/config",
      {},
      { label: "Load deployment admin config", responseKind: "json" },
    );
    const data = await response.json();
    setAdminConfig(data);
  }

  async function createDeployment() {
    setIsDeploying(true);
    setAdminMessage(null);
    try {
      const response = await tracedFetch("/api/admin/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deploymentDraft),
      }, { label: "Create Foundry deployment", request: deploymentDraft, responseKind: "json" });
      const data = await response.json();
      if (!response.ok) {
        setAdminMessage({ type: "error", text: data.detail ?? "Failed to create deployment." });
        return;
      }

      const deploymentName = data.settings.model as string;
      setModels((current) =>
        current.includes(deploymentName) ? current : [...current, deploymentName],
      );
      setActiveModel(deploymentName);
      setSelectedModels((current) => new Set([...current, deploymentName]));
      setDeploymentDraft(defaultDeploymentDraft);
      setAdminMessage({
        type: "success",
        text:
          data.deployment.status === "completed"
            ? `Created deployment ${deploymentName}.`
            : `Started deployment ${deploymentName}. It can take a few minutes before Foundry serves it.`,
      });
    } finally {
      setIsDeploying(false);
    }
  }

  async function runChat() {
    if (!prompt.trim() || !activeModel) {
      return;
    }

    const userPrompt = prompt.trim();
    const pendingUser = createUserMessage(userPrompt);
    const pendingAssistant = createAssistantMessage({ model: activeModel, content: "Thinking..." });
    const pendingGuarded = createAssistantMessage({
      model: activeModel,
      content: "Applying custom guardrail...",
      guardrail_variant: "guarded",
    });
    let receivedDelta = false;
    setPrompt("");
    setIsRunning(true);
    setMessages((current) => [...current, pendingUser, pendingAssistant]);

    try {
      const requestBody = {
        model: activeModel,
        prompt: userPrompt,
        conversation_id: currentConversationId,
        reasoning_effort: reasoningEffort === "default" ? null : reasoningEffort,
      };
      const response = await tracedFetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }, { label: "Stream chat", request: requestBody, responseKind: "stream" });

      if (!response.ok) {
        const data = await response.json();
        replacePendingMessages(2, [
          createUserMessage(userPrompt),
          createAssistantMessage({ model: activeModel, error: data.detail ?? "Unknown error" }),
        ]);
        return;
      }

      const apiEvents = await readServerSentEvents(response, (event) => {
        if (event.type === "start") {
          setCurrentConversationId(event.conversation.id);
          upsertConversation(event.conversation);
          setMessages((current) => {
            const updated = current.map((message) => {
              if (message.id === pendingUser.id) {
                return mapStoredMessage(event.user_message);
              }
              if (message.id === pendingAssistant.id) {
                return {
                  ...message,
                  api_surface: event.api_surface,
                  guardrail_variant: event.guardrail_comparison ? ("baseline" as const) : null,
                };
              }
              return message;
            });
            return event.guardrail_comparison
              ? [
                  ...updated,
                  {
                    ...pendingGuarded,
                    api_surface: event.api_surface,
                    guardrail_policy_name: event.guardrail_policy_name,
                  },
                ]
              : updated;
          });
          return;
        }

        if (event.type === "variant_completed") {
          setCurrentConversationId(event.conversation.id);
          upsertConversation(event.conversation);
          const targetId =
            event.result.guardrail_variant === "guarded"
              ? pendingGuarded.id
              : pendingAssistant.id;
          setMessages((current) =>
            current.map((message) =>
              message.id === targetId
                ? mapStoredMessage(event.result.assistant_message)
                : message,
            ),
          );
          if (event.result.foundry_request) {
            appendFoundryTrace(
              event.result.foundry_request,
              `Foundry ${event.result.guardrail_variant} request for ${activeModel}`,
            );
          }
          if (event.result.foundry_response) {
            appendFoundryResponseTrace(
              event.result.foundry_response,
              `Foundry ${event.result.guardrail_variant} response for ${activeModel}`,
            );
          }
          return;
        }

        if (event.type === "comparison_completed") {
          setCurrentConversationId(event.conversation.id);
          upsertConversation(event.conversation);
          return;
        }

        if (event.type === "foundry_request") {
          appendFoundryTrace(event.request, `Foundry request for ${activeModel}`);
          return;
        }

        if (event.type === "foundry_response") {
          appendFoundryResponseTrace(event.response, `Foundry response for ${activeModel}`);
          return;
        }

        if (event.type === "delta") {
          const delta = event.delta;
          setMessages((current) =>
            current.map((message) =>
              message.id === pendingAssistant.id
                ? {
                    ...message,
                    content: receivedDelta ? `${message.content}${delta}` : delta,
                  }
                : message,
            ),
          );
          receivedDelta = true;
          return;
        }

        if (event.type === "completed") {
          setCurrentConversationId(event.conversation.id);
          upsertConversation(event.conversation);
          setMessages((current) =>
            current.map((message) =>
              message.id === pendingAssistant.id
                ? mapStoredMessage(event.assistant_message)
                : message,
            ),
          );
          speakResponses([event.assistant_message]);
          return;
        }

        if (event.type === "error") {
          setMessages((current) =>
            current.map((message) =>
              message.id === pendingAssistant.id
                ? event.assistant_message
                  ? mapStoredMessage(event.assistant_message)
                  : { ...message, error: event.error }
                : message,
            ),
          );
        }
      });
      appendApiResponseTrace({
        label: "Stream chat response",
        method: "SSE",
        url: "/api/chat/stream",
        status: response.status,
        response: { events: apiEvents },
      });
    } finally {
      setIsRunning(false);
    }
  }

  async function runDocumentChat() {
    if (!prompt.trim() || !activeModel || !documents.length) {
      return;
    }

    const userPrompt = prompt.trim();
    const pendingUser = createUserMessage(userPrompt);
    const pendingAssistant = createAssistantMessage({ model: activeModel, content: "Retrieving documents..." });
    const pendingGuarded = createAssistantMessage({
      model: activeModel,
      content: "Applying custom guardrail to retrieved context...",
      guardrail_variant: "guarded",
    });
    let receivedDelta = false;
    setPrompt("");
    setIsRunning(true);
    setMessages((current) => [...current, pendingUser, pendingAssistant]);

    try {
      const requestBody = {
        model: activeModel,
        prompt: userPrompt,
        conversation_id: currentConversationId,
        reasoning_effort: reasoningEffort === "default" ? null : reasoningEffort,
      };
      const response = await tracedFetch("/api/documents/ask/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }, { label: "Stream document RAG answer", request: requestBody, responseKind: "stream" });

      if (!response.ok) {
        const data = await response.json();
        replacePendingMessages(2, [
          createUserMessage(userPrompt),
          createAssistantMessage({ model: activeModel, error: data.detail ?? "Unknown error" }),
        ]);
        return;
      }

      const apiEvents = await readServerSentEvents(response, (event) => {
        if (event.type === "start") {
          setCurrentConversationId(event.conversation.id);
          upsertConversation(event.conversation);
          setMessages((current) => {
            const updated = current.map((message) => {
              if (message.id === pendingUser.id) {
                return mapStoredMessage(event.user_message);
              }
              if (message.id === pendingAssistant.id) {
                return {
                  ...message,
                  api_surface: event.api_surface,
                  content: "Reading retrieved document excerpts...",
                  guardrail_variant: event.guardrail_comparison ? ("baseline" as const) : null,
                };
              }
              return message;
            });
            return event.guardrail_comparison
              ? [
                  ...updated,
                  {
                    ...pendingGuarded,
                    api_surface: event.api_surface,
                    guardrail_policy_name: event.guardrail_policy_name,
                  },
                ]
              : updated;
          });
          return;
        }

        if (event.type === "variant_completed") {
          setCurrentConversationId(event.conversation.id);
          upsertConversation(event.conversation);
          const targetId =
            event.result.guardrail_variant === "guarded"
              ? pendingGuarded.id
              : pendingAssistant.id;
          setMessages((current) =>
            current.map((message) =>
              message.id === targetId
                ? mapStoredMessage(event.result.assistant_message)
                : message,
            ),
          );
          if (event.result.foundry_request) {
            appendFoundryTrace(
              event.result.foundry_request,
              `Foundry grounded ${event.result.guardrail_variant} request for ${activeModel}`,
            );
          }
          if (event.result.foundry_response) {
            appendFoundryResponseTrace(
              event.result.foundry_response,
              `Foundry grounded ${event.result.guardrail_variant} response for ${activeModel}`,
            );
          }
          return;
        }

        if (event.type === "comparison_completed") {
          setCurrentConversationId(event.conversation.id);
          upsertConversation(event.conversation);
          return;
        }

        if (event.type === "retrieval") {
          if (event.embedding.foundry_request) {
            appendFoundryTrace(event.embedding.foundry_request, `Foundry embeddings for document question`);
          }
          if (event.embedding.foundry_response) {
            appendFoundryResponseTrace(event.embedding.foundry_response, "Foundry embeddings response");
          }
          appendApiTrace({
            direction: "api_frontend",
            label: "Azure AI Search retrieval results",
            method: "RECV",
            url: "/api/documents/ask/stream",
            response: {
              sources: event.sources.map((source) => ({
                filename: source.filename,
                chunk_index: source.chunk_index,
                score: source.score,
                preview: source.content.slice(0, 300),
              })),
            },
          });
          return;
        }

        if (event.type === "foundry_request") {
          appendFoundryTrace(event.request, `Foundry grounded request for ${activeModel}`);
          return;
        }

        if (event.type === "foundry_response") {
          appendFoundryResponseTrace(event.response, `Foundry grounded response for ${activeModel}`);
          return;
        }

        if (event.type === "delta") {
          const delta = event.delta;
          setMessages((current) =>
            current.map((message) =>
              message.id === pendingAssistant.id
                ? {
                    ...message,
                    content: receivedDelta ? `${message.content}${delta}` : delta,
                  }
                : message,
            ),
          );
          receivedDelta = true;
          return;
        }

        if (event.type === "completed") {
          setCurrentConversationId(event.conversation.id);
          upsertConversation(event.conversation);
          setMessages((current) =>
            current.map((message) =>
              message.id === pendingAssistant.id
                ? mapStoredMessage(event.assistant_message)
                : message,
            ),
          );
          speakResponses([event.assistant_message]);
          return;
        }

        if (event.type === "error") {
          setMessages((current) =>
            current.map((message) =>
              message.id === pendingAssistant.id
                ? event.assistant_message
                  ? mapStoredMessage(event.assistant_message)
                  : { ...message, error: event.error }
                : message,
            ),
          );
        }
      });
      appendApiResponseTrace({
        label: "Document RAG stream response",
        method: "SSE",
        url: "/api/documents/ask/stream",
        status: response.status,
        response: { events: apiEvents },
      });
    } finally {
      setIsRunning(false);
    }
  }

  async function runComparison() {
    if (!prompt.trim() || !selected.length) {
      return;
    }

    const userPrompt = prompt.trim();
    setPrompt("");
    setIsRunning(true);
    setMessages((current) => [
      ...current,
      createUserMessage(userPrompt),
      ...selected.map((model) => createAssistantMessage({ model, content: "Thinking..." })),
    ]);

    try {
      const requestBody = {
        models: selected,
        prompt: userPrompt,
        conversation_id: currentConversationId,
        reasoning_effort: reasoningEffort === "default" ? null : reasoningEffort,
      };
      const response = await tracedFetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }, {
        label: "Compare models",
        request: requestBody,
        responseKind: "json",
        traceResponse: false,
      });
      const data = await response.json();

      if (!response.ok) {
        appendApiResponseTrace({
          label: "Compare models response",
          method: "RECV",
          url: "/api/compare",
          status: response.status,
          response: data,
        });
        replacePendingMessages(selected.length + 1, [
          createUserMessage(userPrompt),
          createAssistantMessage({ model: "Request failed", error: data.detail ?? "Unknown error" }),
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
          appendFoundryTrace(result.foundry_request, `Foundry request for ${result.model}`);
        }
        if (result.foundry_response) {
          appendFoundryResponseTrace(result.foundry_response, `Foundry response for ${result.model}`);
        }
      }
      appendApiResponseTrace({
        label: "Compare models response",
        method: "RECV",
        url: "/api/compare",
        status: response.status,
        response: data,
      });
      const assistantMessages = flatResults.map(
        (result: { assistant_message: StoredMessage }) => result.assistant_message,
      );
      replacePendingMessages(selected.length + 1, [
        mapStoredMessage(data.user_message),
        ...assistantMessages.map(mapStoredMessage),
      ]);
      speakResponses(
        assistantMessages.filter((message: StoredMessage) => message.guardrail_variant !== "guarded"),
      );
    } finally {
      setIsRunning(false);
    }
  }

  function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (comparisonMode) {
      void runComparison();
    } else if (activeUseCase === "document_qa") {
      void runDocumentChat();
    } else {
      void runChat();
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
        ? Boolean(activeModel && config?.is_document_rag_configured && documents.length)
        : Boolean(activeModel));
  const missingDocumentRagConfig = [
    config?.search_endpoint ? null : "AZURE_SEARCH_ENDPOINT",
    config?.search_index_name ? null : "AZURE_SEARCH_INDEX_NAME",
    config?.storage_account_url ? null : "AZURE_STORAGE_ACCOUNT_URL",
    config?.storage_container_name ? null : "AZURE_STORAGE_CONTAINER_NAME",
    config?.embedding_model ? null : "FOUNDRY_EMBEDDING_MODEL",
  ].filter(Boolean);
  const documentRagConfigMessage = config
    ? `Set ${missingDocumentRagConfig.join(", ")} to enable document RAG.`
    : "Loading document RAG configuration...";
  const authDisplayName = auth?.name || auth?.email || "Signed in";
  const currentRelativeUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const loginUrl = `/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(
    currentRelativeUrl || "/",
  )}`;
  const logoutUrl = `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent("/")}`;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-[#303033] dark:text-slate-50">
      <header className="relative flex h-12 items-center border-b bg-white px-5 dark:border-[#55555a] dark:bg-[#39393d]">
        <h1 className="truncate text-lg font-semibold">Foundry Demo</h1>
        <div className="absolute left-1/2 -translate-x-1/2">
          <button
            type="button"
            onClick={() => {
              setActiveView("chat");
              setUseCaseMarketplaceOpen(true);
            }}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-200 dark:border-[#606066] dark:bg-[#45454a] dark:text-slate-200 dark:hover:bg-[#505056]",
              activeView === "chat" &&
                "border-blue-300 bg-blue-50 text-blue-700 dark:border-violet-500/60 dark:bg-violet-500/15 dark:text-violet-200",
            )}
            title="Open the use-case marketplace"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Use cases
            <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-[#303033] dark:text-slate-200">
              {activeUseCaseDetails.shortTitle}
            </span>
            {realtimeStatus !== "idle" || traditionalVoiceStatus === "recording" ? (
              <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] text-white">
                {realtimeStatus !== "idle" ? "Live" : "Recording"}
              </span>
            ) : null}
          </button>
        </div>
        <div className="ml-auto flex items-center gap-3 text-slate-400 dark:text-slate-500">
          {auth?.authenticated ? (
            <details ref={accountMenuRef} className="group relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/50 dark:bg-emerald-500/15 dark:text-emerald-200 dark:hover:bg-emerald-500/20 [&::-webkit-details-marker]:hidden">
                <User className="h-3.5 w-3.5" />
                <span className="max-w-[11rem] truncate" title={authDisplayName}>
                  {authDisplayName}
                </span>
                <ChevronsUpDown className="h-3.5 w-3.5" />
              </summary>
              <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 shadow-xl dark:border-[#606066] dark:bg-[#39393d] dark:text-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    accountMenuRef.current?.removeAttribute("open");
                    setApiTraceOpen(false);
                    setActiveView("metrics");
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-[#45454a]"
                >
                  <BarChart3 className="h-4 w-4" />
                  Model metrics
                </button>
                <button
                  type="button"
                  onClick={() => {
                    accountMenuRef.current?.removeAttribute("open");
                    setApiTraceOpen(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-[#45454a]"
                >
                  <Network className="h-4 w-4" />
                  API trace
                  {apiTraceEntries.length ? (
                    <span className="ml-auto rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] text-white dark:bg-violet-600">
                      {apiTraceEntries.length}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  disabled={!canUseProtectedApis}
                  onClick={() => {
                    accountMenuRef.current?.removeAttribute("open");
                    setApiTraceOpen(false);
                    setActiveView("settings");
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#45454a]"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </button>
                <button
                  type="button"
                  onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-[#45454a]"
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  {theme === "dark" ? "Light theme" : "Dark theme"}
                </button>
                <a
                  href={logoutUrl}
                  className="mt-1 flex items-center gap-2 border-t border-slate-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:border-[#55555a] dark:text-red-300 dark:hover:bg-red-950/30"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </a>
              </div>
            </details>
          ) : (
            <>
              <button
                type="button"
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                className="rounded-full border border-slate-200 bg-slate-100 p-1.5 text-slate-500 transition hover:bg-slate-200 dark:border-[#606066] dark:bg-[#45454a] dark:text-slate-300 dark:hover:bg-[#505056]"
              >
                {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                disabled={!entraAuthEnabled}
                onClick={() => {
                  window.location.assign(loginUrl);
                }}
                title={
                  entraAuthEnabled
                    ? "Sign in with your Microsoft account"
                    : "Entra authentication is not enabled for this environment"
                }
                className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:border-violet-500/60 dark:bg-violet-500/15 dark:text-violet-200 dark:hover:bg-violet-500/25 dark:disabled:border-[#606066] dark:disabled:bg-[#45454a] dark:disabled:text-slate-500"
              >
                <LogIn className="h-3.5 w-3.5" />
                Sign in with Microsoft
              </button>
            </>
          )}
        </div>
      </header>

      {conversationsOpen ? (
        <div className="fixed left-5 top-14 z-40 w-[min(22rem,calc(100vw-2.5rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-[#606066] dark:bg-[#39393d]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Previous Conversations</h2>
            <button
              type="button"
              onClick={() => setConversationsOpen(false)}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#45454a]"
              aria-label="Close previous conversations"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Button type="button" variant="outline" className="w-full justify-start" onClick={startNewChat}>
            <Plus className="h-4 w-4" />
            New chat
          </Button>
          <div className="mt-3 grid max-h-[60vh] gap-1 overflow-y-auto pr-1">
            {conversations.length ? (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => void loadConversation(conversation.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setConversationMenu({
                      conversation,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                  className={cn(
                    "truncate rounded-md px-2 py-2 text-left text-sm transition hover:bg-slate-100 dark:hover:bg-[#45454a]",
                    currentConversationId === conversation.id &&
                      "bg-slate-100 font-medium dark:bg-[#45454a]",
                  )}
                  title={conversation.title}
                >
                  {conversation.title}
                </button>
              ))
            ) : (
              <p className="px-2 py-3 text-xs text-slate-500 dark:text-slate-400">
                No saved chats yet.
              </p>
            )}
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "grid h-[calc(100vh-3rem)] grid-cols-1 gap-4 p-4",
          !authGateActive && "lg:grid-cols-[18rem_minmax(0,1fr)]",
        )}
      >
        {!authGateActive ? (
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-white p-4 shadow-sm dark:border-[#55555a] dark:bg-[#39393d]">
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
          <div className="grid gap-2">
            <Label htmlFor="active-model" className="text-slate-700 dark:text-slate-200">
              Model
            </Label>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <select
                  id="active-model"
                  value={activeModel}
                  onChange={(event) => setActiveModel(event.target.value)}
                  className="h-9 w-full min-w-0 appearance-none truncate rounded-md border border-slate-300 bg-white px-3 py-1 pr-9 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
                >
                  {models.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
                <ChevronsUpDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-500 dark:text-slate-400" />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!canUseProtectedApis}
                onClick={() => void openSettings(activeModel)}
                title="Open model settings"
                className="shrink-0"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-4 border-t pt-4 dark:border-[#55555a]">
            <Button
              type="button"
              variant="outline"
              className={cn(
                "w-full justify-start",
                conversationsOpen &&
                  "border-blue-300 bg-blue-50 text-blue-700 dark:border-violet-500/60 dark:bg-violet-500/15 dark:text-violet-200",
              )}
              onClick={() => setConversationsOpen((open) => !open)}
            >
              <Clock className="h-4 w-4" />
              Previous Conversations
            </Button>
          </div>

          {activeUseCaseDetails.showDocumentControls ? (
            <div className="mt-4 border-t pt-4 dark:border-[#55555a]">
              <SidebarSection title="Documents">
                <div className="grid gap-2">
                  <input
                    ref={documentFileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept=".pdf,.docx,.txt,.md,.csv,.json,.html,.htm,.xml,.log,text/*,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(event) => void uploadDocuments(event.target.files)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start"
                    disabled={!canUseProtectedApis || !config?.is_document_rag_configured || documentsLoading}
                    onClick={() => documentFileInputRef.current?.click()}
                  >
                    <UploadCloud className="h-4 w-4" />
                    {documentsLoading ? "Indexing..." : "Upload documents"}
                  </Button>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500 dark:border-[#606066] dark:bg-[#45454a] dark:text-slate-400">
                    {config?.is_document_rag_configured ? (
                      <>
                        <div className="font-medium text-slate-700 dark:text-slate-200">
                          Azure AI Search
                        </div>
                        <div className="truncate" title={config.search_index_name ?? undefined}>
                          Index: {config.search_index_name}
                        </div>
                        <div className="truncate" title={config.storage_container_name ?? undefined}>
                          Blob container: {config.storage_container_name}
                        </div>
                        <div className="truncate" title={config.embedding_model ?? undefined}>
                          Embeddings: {config.embedding_model}
                        </div>
                      </>
                    ) : (
                      documentRagConfigMessage
                    )}
                  </div>
                  {documentMessage ? (
                    <p
                      className={cn(
                        "rounded-lg border px-3 py-2 text-xs leading-5",
                        documentMessage.type === "success"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100"
                          : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100",
                      )}
                    >
                      {documentMessage.text}
                    </p>
                  ) : null}
                  <div className="grid max-h-64 gap-2 overflow-y-auto pr-1">
                    {documents.length ? (
                      documents.map((document) => (
                        <div
                          key={document.id}
                          className="rounded-lg border border-slate-200 bg-white p-2 text-xs dark:border-[#606066] dark:bg-[#29292c]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate font-medium text-slate-800 dark:text-slate-100" title={document.filename}>
                                {document.filename}
                              </div>
                              <div className="mt-1 text-slate-500 dark:text-slate-400">
                                {document.chunk_count} chunks - {formatBytes(document.byte_size)}
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
                              onClick={() => void deleteRagDocument(document)}
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

          {activeUseCaseDetails.showBrowserVoiceControls ? (
          <div className="mt-4 border-t pt-4 dark:border-[#55555a]">
            <SidebarSection title="Browser convenience voice">
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={toggleDictation}
                  disabled={!speechRecognitionSupported}
                  className={cn(
                    "flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#606066] dark:bg-[#45454a]",
                    isListening && "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {isListening ? (
                      <MicOff className="h-4 w-4 text-red-600" />
                    ) : (
                      <Mic className="h-4 w-4 text-violet-600" />
                    )}
                    Browser dictation
                  </span>
                  <Badge variant={isListening ? "destructive" : "outline"} className="shrink-0">
                    {isListening ? "Listening" : "Off"}
                  </Badge>
                </button>
                <button
                  type="button"
                  onClick={toggleReadback}
                  disabled={!speechSynthesisSupported}
                  className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#606066] dark:bg-[#45454a]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {voiceReadbackEnabled ? (
                      <Volume2 className="h-4 w-4 text-violet-600" />
                    ) : (
                      <VolumeX className="h-4 w-4 text-slate-500" />
                    )}
                    Browser readback
                  </span>
                  <Badge variant={voiceReadbackEnabled ? "default" : "outline"} className="shrink-0">
                    {voiceReadbackEnabled ? "On" : "Off"}
                  </Badge>
                </button>
                <div className="grid gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-[#606066] dark:bg-[#45454a]">
                  <Label htmlFor="voice-model" className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Text model for dictation
                  </Label>
                  <select
                    id="voice-model"
                    value={selectedVoiceModel}
                    disabled={!models.length}
                    onChange={(event) => changeVoiceModel(event.target.value)}
                    className="h-8 w-full min-w-0 truncate rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
                  >
                    {models.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Browser speech-to-text becomes a text prompt for this model.
                  </p>
                </div>
                <div className="grid gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-[#606066] dark:bg-[#45454a]">
                  <Label htmlFor="speech-voice" className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Readback voice
                  </Label>
                  <select
                    id="speech-voice"
                    value={selectedSpeechVoiceURI}
                    disabled={!speechSynthesisSupported || !availableSpeechVoices.length}
                    onChange={(event) => setSelectedSpeechVoiceURI(event.target.value)}
                    className="h-8 w-full min-w-0 truncate rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
                  >
                    {availableSpeechVoices.length ? (
                      availableSpeechVoices.map((voice) => (
                        <option key={voice.voiceURI} value={voice.voiceURI}>
                          {voice.name} ({voice.lang})
                        </option>
                      ))
                    ) : (
                      <option value="">System default</option>
                    )}
                  </select>
                </div>
                {voiceError ? (
                  <p className="text-xs text-amber-600 dark:text-amber-300">{voiceError}</p>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Dictation and readback use browser speech APIs; available voices depend on
                    your browser and OS.
                  </p>
                )}
              </div>
            </SidebarSection>
          </div>
          ) : null}

          {activeUseCaseDetails.showComparisonControls ? (
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

              <div className="mt-3 flex flex-col gap-2">
                {models.map((model) => (
                  <div
                    key={model}
                    className={cn(
                      "flex items-center justify-between rounded-md border px-2 py-1.5 text-sm",
                      selectedModels.has(model)
                        ? "border-blue-300 bg-blue-50 dark:border-violet-500/60 dark:bg-violet-500/15"
                        : "border-slate-200 bg-white dark:border-[#606066] dark:bg-[#29292c]",
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left"
                      onClick={() => toggleModel(model)}
                    >
                      {model}
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-[#45454a]"
                      onClick={() => void openSettings(model)}
                      aria-label={`Open settings for ${model}`}
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </SidebarSection>
          </div>
          ) : null}
          </div>
          <div className="mt-4 flex shrink-0 justify-center border-t pt-4 dark:border-[#55555a]">
            <FoundryStatusPill config={config} />
          </div>
        </aside>
        ) : null}

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-white shadow-sm dark:border-[#55555a] dark:bg-[#39393d]">
          {!authGateActive ? (
          <div className="flex items-center justify-between border-b px-5 py-4 dark:border-[#55555a]">
            <div>
              <h2 className="font-semibold">
                {activeView === "metrics"
                  ? "Model metrics"
                  : activeView === "settings"
                    ? "Settings"
                    : activeUseCaseDetails.title}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {activeView === "metrics"
                  ? "Usage and performance from saved local chat history"
                  : activeView === "settings"
                    ? "Deployment shortcuts and future app-level settings"
                    : activeUseCaseDetails.workspace === "comparison"
                      ? `Comparing ${selected.length} model endpoint${selected.length === 1 ? "" : "s"}`
                      : activeUseCase === "document_qa"
                        ? `${documents.length} indexed document${documents.length === 1 ? "" : "s"} - active model: ${activeModel}`
                      : activeUseCaseDetails.workspace === "traditionalVoice" ||
                          activeUseCaseDetails.workspace === "realtimeVoice"
                        ? activeUseCaseDetails.description
                        : `${currentConversationId
                            ? conversations.find((item) => item.id === currentConversationId)?.title ?? "Saved chat"
                            : "New unsaved chat"} - active model: ${activeModel}`}
              </p>
            </div>
            <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
              <button
                type="button"
                onClick={() => void openSettings(activeModel)}
                className="rounded p-1 hover:bg-slate-100 dark:hover:bg-[#45454a]"
                aria-label="Open active model settings"
              >
                <Settings className="h-4 w-4" />
              </button>
              <GitCompareArrows
                className={cn(
                  "h-4 w-4",
                  comparisonMode ? "text-violet-600 dark:text-violet-300" : "text-slate-400",
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

          {authGateActive ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="max-w-md text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-violet-500/15 dark:text-violet-200">
                  <LogIn className="h-7 w-7" />
                </div>
                <h2 className="text-2xl font-semibold">
                  {auth === null ? "Checking access..." : "Sign in to Foundry Demo"}
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
              metrics={metrics}
              selectedModel={metricsModel}
              days={metricsDays}
              loading={metricsLoading}
              error={metricsError}
              onModelChange={setMetricsModel}
              onDaysChange={setMetricsDays}
              onRefresh={() => void refreshMetrics()}
            />
          ) : activeView === "settings" ? (
            <SettingsPage
              models={models}
              newModel={newModel}
              message={modelEndpointMessage}
              onNewModelChange={setNewModel}
              onAddModel={() => void addModel()}
              onOpenAdmin={() => void openAdmin()}
            />
          ) : activeUseCaseDetails.workspace === "comparison" ? (
            <ComparisonWorkspace
              allModels={models}
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
              onOpenSettings={(model) => void openSettings(model)}
              onModelChange={replaceComparisonModel}
            />
          ) : activeUseCaseDetails.workspace === "traditionalVoice" ? (
            <div className="flex-1 overflow-auto p-5">
              <div className="mx-auto flex min-h-full max-w-4xl items-center justify-center">
                <TraditionalVoiceHero
                  configured={config?.is_traditional_voice_configured ?? false}
                  activeModel={activeModel}
                  transcriptionModel={config?.transcription_model ?? "gpt-4o-mini-transcribe"}
                  ttsModel={config?.tts_model ?? "gpt-4o-mini-tts"}
                  ttsVoice={config?.tts_voice ?? "alloy"}
                  status={traditionalVoiceStatus}
                  error={traditionalVoiceError}
                  result={traditionalVoiceResult}
                  audioUrl={traditionalAudioUrl}
                  onStart={() => void startTraditionalRecording()}
                  onStop={stopTraditionalRecording}
                />
              </div>
            </div>
          ) : activeUseCaseDetails.workspace === "realtimeVoice" ? (
            <div className="flex-1 overflow-auto p-5">
              <div className="mx-auto flex min-h-full max-w-4xl items-center justify-center">
                <RealtimeVoiceHero
                  configured={config?.is_realtime_configured ?? false}
                  model={realtimeSessionModel ?? config?.realtime_model ?? "gpt-realtime-2.1"}
                  status={realtimeStatus}
                  error={realtimeError}
                  guardrailStatus={realtimeGuardrailStatus}
                  transcript={realtimeTranscript}
                  onStart={() => void startRealtimeSession()}
                  onStop={stopRealtimeSession}
                />
              </div>
            </div>
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

              <form
                onSubmit={submitPrompt}
                className="border-t bg-slate-50 px-4 py-3 dark:border-[#55555a] dark:bg-[#29292c]"
              >
                <div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_1px_4px_rgba(15,23,42,0.16)] transition focus-within:border-slate-300 focus-within:ring-2 focus-within:ring-blue-500/10 dark:border-[#606066] dark:bg-[#2f2f33] dark:shadow-none dark:focus-within:border-violet-500/70 dark:focus-within:ring-violet-400/10">
                  <Textarea
                    aria-label="Chat prompt"
                    placeholder="Ask anything..."
                    value={prompt}
                    rows={2}
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        if (canSubmit) {
                          event.currentTarget.form?.requestSubmit();
                        }
                      }
                    }}
                    className="min-h-[44px] resize-none border-0 bg-transparent px-3 py-2 text-[15px] shadow-none placeholder:text-slate-400 focus-visible:ring-0 dark:bg-transparent dark:placeholder:text-slate-500"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={!activeModel || !canUseProtectedApis}
                        onClick={() => void openSettings(activeModel)}
                        title="Open active model settings"
                        className="h-8 w-8 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-[#3b3b40] dark:hover:text-slate-100"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <select
                        id="composer-model"
                        aria-label="Composer model"
                        value={activeModel}
                        onChange={(event) => setActiveModel(event.target.value)}
                        className="h-8 max-w-[12rem] appearance-none truncate rounded-full border-0 bg-transparent px-2 text-sm text-slate-700 outline-none transition hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:ring-1 focus-visible:ring-blue-500 dark:text-slate-200 dark:hover:bg-[#3b3b40] dark:focus-visible:bg-[#3b3b40] dark:focus-visible:ring-violet-500"
                      >
                        {models.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                      <select
                        id="composer-reasoning"
                        aria-label="Reasoning level"
                        value={reasoningEffort}
                        onChange={(event) => setReasoningEffort(event.target.value as ReasoningEffort)}
                        className="h-8 appearance-none rounded-full border-0 bg-transparent px-2 text-sm text-slate-700 outline-none transition hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:ring-1 focus-visible:ring-blue-500 dark:text-slate-200 dark:hover:bg-[#3b3b40] dark:focus-visible:bg-[#3b3b40] dark:focus-visible:ring-violet-500"
                        title="Reasoning effort is sent to Responses API reasoning-capable deployments."
                      >
                        {reasoningEffortOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span className="rounded-full px-2 py-1 text-sm text-slate-700 dark:text-slate-200">
                        {activeUseCase === "document_qa" ? "Document RAG" : "Foundry chat"}
                      </span>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      {activeUseCaseDetails.enableComposerDictation ? (
                        <>
                          <Infinity className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
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
                            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                          </Button>
                        </>
                      ) : null}
                      <Button
                        type="submit"
                        size="icon"
                        disabled={!canSubmit}
                        className="h-8 w-8 rounded-full bg-slate-500 text-white shadow-none hover:bg-slate-600 disabled:bg-slate-300 disabled:text-white dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white dark:disabled:bg-slate-600 dark:disabled:text-slate-300"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
                  AI-generated content may be incorrect
                </p>
              </form>
            </>
          )}
        </section>
      </div>

      {settingsModel ? (
        <SettingsModal
          model={settingsModel}
          draft={settingsDraft}
          saving={isSavingSettings}
          policies={guardrailPolicies}
          deploymentPolicy={deploymentGuardrailPolicy}
          policiesLoading={guardrailPoliciesLoading}
          error={settingsError}
          onClose={() => setSettingsModel(null)}
          onSave={() => void saveSettings()}
          onReset={() =>
            setSettingsDraft((current) =>
              current ? { model: current.model, ...defaultSettings } : current,
            )
          }
          onChange={(patch) =>
            setSettingsDraft((current) => (current ? { ...current, ...patch } : current))
          }
        />
      ) : null}

      {adminOpen ? (
        <AdminDeploymentModal
          config={adminConfig}
          draft={deploymentDraft}
          deploying={isDeploying}
          message={adminMessage}
          onClose={() => setAdminOpen(false)}
          onCreate={() => void createDeployment()}
          onChange={(patch) =>
            setDeploymentDraft((current) => ({ ...current, ...patch }))
          }
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
        open={apiTraceOpen}
        entries={apiTraceEntries}
        filter={apiTraceFilter}
        onClose={() => setApiTraceOpen(false)}
        onClear={() => setApiTraceEntries([])}
        onFilterChange={setApiTraceFilter}
      />

      {conversationMenu ? (
        <div
          className="fixed z-50 min-w-44 rounded-md border bg-white p-1 shadow-lg dark:border-[#606066] dark:bg-[#29292c]"
          style={{ left: conversationMenu.x, top: conversationMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
            onClick={() => void deleteConversationById(conversationMenu.conversation)}
          >
            <Trash2 className="h-4 w-4" />
            Delete conversation
          </button>
        </div>
      ) : null}
    </main>
  );
}

function FoundryStatusPill({ config }: { config: ConfigResponse | null }) {
  if (config === null) {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:border-[#606066] dark:bg-[#45454a] dark:text-slate-200"
        title="Loading Foundry configuration..."
      >
        <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
        Foundry
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:border-[#606066] dark:bg-[#45454a] dark:text-slate-200"
      title={config.endpoint ?? "Set FOUNDRY_PROJECT_ENDPOINT in .env."}
    >
      <span
        className={cn(
          "h-2.5 w-2.5 rounded-full",
          config.is_configured ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]" : "bg-amber-500",
        )}
      />
      {config.is_configured ? "Foundry connected" : "Foundry not configured"}
    </span>
  );
}

function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
      {children}
    </section>
  );
}

function ChatEmptyState({
  useCase,
  activeModel,
  onOpenUseCases,
}: {
  useCase: UseCaseId;
  activeModel: string;
  onOpenUseCases: () => void;
}) {
  const browserVoice = useCase === "browser_voice";
  const documentQa = useCase === "document_qa";
  return (
    <div className="max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-violet-50 text-violet-600 shadow-[0_0_0_8px_rgba(124,58,237,0.08)] dark:bg-violet-500/15 dark:text-violet-200">
        {documentQa ? (
          <FileText className="h-7 w-7" />
        ) : browserVoice ? (
          <Mic className="h-7 w-7" />
        ) : (
          <Bot className="h-7 w-7" />
        )}
      </div>
      <h3 className="text-2xl font-semibold tracking-tight">
        {documentQa ? "Ask your documents" : browserVoice ? "Browser based voice" : "Start a chat session"}
      </h3>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
        {documentQa
          ? `Upload documents in the sidebar, then ask questions. The app retrieves context with Azure AI Search and answers with ${activeModel}.`
          : browserVoice
          ? `Use browser dictation to fill the prompt, then send it to ${activeModel}. Browser readback can speak the text response.`
          : `Ask anything with ${activeModel}. Add voice, comparison, or realtime scenarios from the use-case marketplace when needed.`}
      </p>
      <Button type="button" variant="outline" className="mt-5 rounded-full" onClick={onOpenUseCases}>
        <Sparkles className="h-4 w-4" />
        Browse use cases
      </Button>
    </div>
  );
}

function TraditionalVoiceHero({
  configured,
  activeModel,
  transcriptionModel,
  ttsModel,
  ttsVoice,
  status,
  error,
  result,
  audioUrl,
  onStart,
  onStop,
}: {
  configured: boolean;
  activeModel: string;
  transcriptionModel: string;
  ttsModel: string;
  ttsVoice: string;
  status: TraditionalVoiceStatus;
  error: string;
  result: TraditionalVoiceResult | null;
  audioUrl: string;
  onStart: () => void;
  onStop: () => void;
}) {
  const isRecording = status === "recording";
  const isProcessing = status === "processing";
  const actionLabel = isRecording
    ? "Stop recording"
    : isProcessing
      ? "Processing..."
      : result
        ? "Record again"
        : "Record voice prompt";
  const pipelineSteps = [
    { label: "STT", value: transcriptionModel },
    { label: "Chat", value: activeModel || "Select a chat model" },
    { label: "TTS", value: `${ttsModel} (${ttsVoice})` },
  ];

  return (
    <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
      <div className="text-center">
        <DictationHero active={isRecording || isProcessing} />
        <Badge variant="outline">Traditional pipeline</Badge>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight">STT - Chat - TTS</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          Record audio in the browser, send it to Foundry transcription, ask{" "}
          <span className="font-medium text-slate-700 dark:text-slate-200">{activeModel}</span>,
          then synthesize the answer with Foundry text-to-speech.
        </p>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        {pipelineSteps.map((step) => (
          <div
            key={step.label}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left dark:border-[#606066] dark:bg-[#45454a]"
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {step.label}
            </div>
            <div className="mt-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
              {step.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex justify-center">
        <Button
          type="button"
          onClick={isRecording ? onStop : onStart}
          disabled={!configured || isProcessing || !activeModel}
          variant={isRecording ? "destructive" : "default"}
          className="rounded-full px-5"
        >
          {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          {actionLabel}
        </Button>
      </div>

      {!configured ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          Set FOUNDRY_PROJECT_ENDPOINT plus transcription and TTS deployments to enable the
          server-side voice pipeline.
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-5 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="mt-5 grid gap-3 text-left">
          <VoiceResultBlock label="Transcript" text={result.transcription.text} />
          <div className={cn("grid gap-3", result.results.length > 1 && "lg:grid-cols-2")}>
            {result.results.map((variant) => {
              const variantAudioUrl = variant.speech
                ? `data:${variant.speech.audio_mime_type};base64,${variant.speech.audio_base64}`
                : "";
              return (
                <div
                  key={variant.assistant_message.id}
                  className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-[#606066] dark:bg-[#45454a]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={variant.guardrail_variant === "guarded" ? "default" : "outline"}>
                      {variant.guardrail_variant === "guarded"
                        ? variant.guardrail_policy_name ?? "Custom guardrail"
                        : variant.guardrail_variant === "baseline"
                          ? "Deployment default"
                          : "Assistant response"}
                    </Badge>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {variant.duration_ms ?? 0} ms chat
                      {variant.speech ? ` · ${variant.speech.duration_ms} ms TTS` : ""}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800 dark:text-slate-100">
                    {variant.error ?? variant.content}
                  </p>
                  {variantAudioUrl ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="justify-self-start"
                      onClick={() => void new Audio(variantAudioUrl).play()}
                    >
                      <Volume2 className="h-4 w-4" />
                      Play TTS
                    </Button>
                  ) : variant.speech_error ? (
                    <p className="text-xs text-red-600 dark:text-red-300">{variant.speech_error}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
          {result.results.length === 1 && audioUrl ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void new Audio(audioUrl).play()}>
              <Volume2 className="h-4 w-4" />
              Replay TTS
            </Button>
          ) : null}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Shared transcription: {result.transcription.duration_ms} ms
          </p>
        </div>
      ) : null}
    </div>
  );
}

function VoiceResultBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-[#606066] dark:bg-[#45454a]">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800 dark:text-slate-100">
        {text}
      </p>
    </div>
  );
}

function RealtimeVoiceHero({
  configured,
  model,
  status,
  error,
  guardrailStatus,
  transcript,
  onStart,
  onStop,
}: {
  configured: boolean;
  model: string;
  status: RealtimeStatus;
  error: string;
  guardrailStatus: string;
  transcript: RealtimeTranscriptEntry[];
  onStart: () => void;
  onStop: () => void;
}) {
  const isActive = status !== "idle";
  const actionLabel =
    status === "connecting" ? "Connecting..." : status === "live" ? "End voice demo" : "Let's talk";

  return (
    <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
      <DictationHero active={isActive} />
      <Badge variant="outline">Realtime pipeline</Badge>
      {guardrailStatus ? (
        <p className="mx-auto mt-3 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          {guardrailStatus}
        </p>
      ) : null}
      <h3 className="mt-3 text-2xl font-semibold tracking-tight">Realtime speech-in/out</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
        Demo Foundry Realtime speech-in/speech-out with{" "}
        <span className="font-medium text-slate-700 dark:text-slate-200">{model}</span>. This sends
        microphone audio directly over WebRTC, separate from the text chat bubbles.
      </p>
      <div className="mt-5 flex justify-center">
        <Button
          type="button"
          onClick={isActive ? onStop : onStart}
          disabled={!configured && !isActive}
          variant={isActive ? "destructive" : "default"}
          className="rounded-full px-5"
        >
          {isActive ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          {actionLabel}
        </Button>
      </div>
      {!configured ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          Set FOUNDRY_REALTIME_ENDPOINT or FOUNDRY_PROJECT_ENDPOINT so the backend can mint
          short-lived Realtime client secrets for Foundry Realtime.
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-5 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
          {error}
        </p>
      ) : null}
      {transcript.length ? (
        <div className="mt-5 grid gap-2 text-left">
          {transcript.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "rounded-2xl px-3 py-2 text-sm leading-5",
                entry.source === "user" &&
                  "ml-auto max-w-[85%] bg-blue-600 text-white dark:bg-violet-600",
                entry.source === "assistant" &&
                  "mr-auto max-w-[85%] border bg-slate-50 text-slate-800 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100",
                entry.source === "system" &&
                  "mx-auto bg-slate-100 text-xs text-slate-500 dark:bg-[#45454a] dark:text-slate-300",
              )}
            >
              {entry.text}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DictationHero({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        "mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full",
        active
          ? "bg-red-50 text-red-600 shadow-[0_0_0_10px_rgba(239,68,68,0.08)] dark:bg-red-950/30 dark:text-red-200"
          : "bg-violet-50 text-violet-600 shadow-[0_0_0_8px_rgba(124,58,237,0.08)] dark:bg-violet-500/15 dark:text-violet-200",
      )}
    >
      <SoundWaveIcon className="h-7 gap-1" />
    </div>
  );
}

type SettingsPageProps = {
  models: string[];
  newModel: string;
  message: StatusMessage | null;
  onNewModelChange: (value: string) => void;
  onAddModel: () => void;
  onOpenAdmin: () => void;
};

function SettingsPage({
  models,
  newModel,
  message,
  onNewModelChange,
  onAddModel,
  onOpenAdmin,
}: SettingsPageProps) {
  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-5 dark:bg-[#303033]">
      <div className="mx-auto grid max-w-5xl gap-4">
        <Card className="rounded-2xl border-slate-200 bg-white shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
          <CardHeader>
            <CardTitle>Model endpoints</CardTitle>
            <CardDescription>
              Model deployment names are stored in the local database. Values from `.env` are only
              used to seed the registry.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex gap-2">
              <Input
                aria-label="Deployment name"
                placeholder="deployment-name"
                value={newModel}
                onChange={(event) => onNewModelChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onAddModel();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={onAddModel}>
                <Plus className="h-4 w-4" />
                Add local endpoint
              </Button>
            </div>
            {message ? (
              <div
                className={cn(
                  "rounded-lg border p-3 text-sm",
                  message.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100"
                    : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100",
                )}
              >
                {message.text}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {models.map((model) => (
                <Badge key={model} variant="secondary">
                  {model}
                </Badge>
              ))}
            </div>
          </CardContent>
          <CardFooter className="border-t pt-4 dark:border-[#55555a]">
            <Button type="button" onClick={onOpenAdmin}>
              <Rocket className="h-4 w-4" />
              Deploy model in Foundry
            </Button>
          </CardFooter>
        </Card>

        <Card className="rounded-2xl border-slate-200 bg-white shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
          <CardHeader>
            <CardTitle>Future settings</CardTitle>
            <CardDescription>
              App-level tools, guardrails, and shared workspace controls can be added here later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              System prompts, generation parameters, API surface, and capability tags remain in each
              model's settings so they stay tied to the selected deployment.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ApiTraceDrawer({
  open,
  entries,
  filter,
  onClose,
  onClear,
  onFilterChange,
}: {
  open: boolean;
  entries: ApiTraceEntry[];
  filter: ApiTraceFilter;
  onClose: () => void;
  onClear: () => void;
  onFilterChange: (filter: ApiTraceFilter) => void;
}) {
  const messageEntries = entries.filter(isMessageTraceEntry);
  const visibleEntries = filter === "messages" ? messageEntries : entries;

  return (
    <aside
      aria-hidden={!open}
      className={cn(
        "fixed inset-y-0 right-0 z-40 flex w-full max-w-2xl transform flex-col border-l bg-white shadow-2xl transition-transform duration-300 ease-out dark:border-[#606066] dark:bg-[#39393d]",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      <header className="flex items-start justify-between gap-4 border-b px-5 py-4 dark:border-[#55555a]">
        <div>
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-blue-600 dark:text-violet-300" />
            <h2 className="font-semibold">API call trace</h2>
            <Badge variant="outline">{visibleEntries.length}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Frontend-to-API calls plus the exact Foundry payloads sent and received.
          </p>
          <div className="mt-3 inline-flex rounded-md border bg-slate-100 p-1 dark:border-[#606066] dark:bg-[#29292c]">
            {[
              { value: "messages" as const, label: "Messages only", count: messageEntries.length },
              { value: "all" as const, label: "All calls", count: entries.length },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onFilterChange(option.value)}
                className={cn(
                  "rounded px-3 py-1 text-xs font-medium transition",
                  filter === option.value
                    ? "bg-white text-slate-950 shadow-sm dark:bg-[#45454a] dark:text-slate-50"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100",
                )}
              >
                {option.label} ({option.count})
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClear} disabled={!entries.length}>
            Clear
          </Button>
          <button
            type="button"
            className="rounded p-1 hover:bg-slate-100 dark:hover:bg-[#45454a]"
            onClick={onClose}
            aria-label="Close API trace"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-slate-50 p-4 dark:bg-[#303033]">
        {visibleEntries.length ? (
          <div className="grid gap-3">
            {visibleEntries.map((entry, index) => (
              <ApiTraceCard key={entry.id} entry={entry} index={index + 1} />
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-center">
            <div className="max-w-sm">
              <Network className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-[#77777d]" />
              <h3 className="text-sm font-semibold">No API calls captured yet</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {filter === "messages"
                  ? "Send a chat prompt or run a comparison to capture message payloads."
                  : "Send a chat prompt or run a comparison to capture API and Foundry payloads."}
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function ApiTraceCard({ entry, index }: { entry: ApiTraceEntry; index: number }) {
  const statusTone =
    entry.error || (entry.status && entry.status >= 400)
      ? "text-red-600 dark:text-red-300"
      : "text-emerald-600 dark:text-emerald-300";

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={entry.direction === "api_foundry" ? "default" : "secondary"}>
              {formatTraceDirection(entry.direction)}
            </Badge>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              #{index} - {formatTraceTimestamp(entry.timestamp)}
            </span>
          </div>
          <h3 className="mt-2 truncate text-sm font-semibold">{entry.label}</h3>
          <p className="mt-1 break-all font-mono text-xs text-slate-500 dark:text-slate-400">
            {entry.method} {entry.url}
          </p>
        </div>
        <div className="text-right text-xs">
          {entry.status ? <div className={statusTone}>HTTP {entry.status}</div> : null}
          {entry.durationMs !== undefined ? (
            <div className="mt-1 text-slate-500 dark:text-slate-400">{entry.durationMs} ms</div>
          ) : null}
          {entry.error ? <div className={statusTone}>{entry.error}</div> : null}
        </div>
      </div>

      {entry.request !== undefined ? <JsonBlock title="Request payload" value={entry.request} /> : null}
      {entry.response !== undefined ? <JsonBlock title="Response" value={entry.response} /> : null}
    </section>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  const [copied, setCopied] = useState(false);
  const formattedValue = formatTraceValue(value);

  async function copyValue() {
    await navigator.clipboard.writeText(formattedValue);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {title}
        </h4>
        <button
          type="button"
          onClick={() => void copyValue()}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#45454a] dark:hover:text-slate-100"
          aria-label={`Copy ${title.toLowerCase()}`}
          title={`Copy ${title.toLowerCase()}`}
        >
          {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">
        {formattedValue}
      </pre>
    </div>
  );
}

type ModelMetricsDashboardProps = {
  models: string[];
  metrics: ModelMetrics | null;
  selectedModel: string;
  days: number;
  loading: boolean;
  error: string;
  onModelChange: (model: string) => void;
  onDaysChange: (days: number) => void;
  onRefresh: () => void;
};

function ModelMetricsDashboard({
  models,
  metrics,
  selectedModel,
  days,
  loading,
  error,
  onModelChange,
  onDaysChange,
  onRefresh,
}: ModelMetricsDashboardProps) {
  const modelOptions = Array.from(new Set([...models, ...(metrics?.models ?? [])]));
  const summary = metrics?.summary;
  const metricDays = metrics?.days ?? [];

  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-5 dark:bg-[#303033]">
      <div className="mx-auto grid max-w-7xl gap-4">
        <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-[#606066] dark:bg-[#39393d]">
          <div>
            <h3 className="text-base font-semibold">Model metrics</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Tracks requests saved by this app, using token usage returned by Foundry.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <select
                aria-label="Metrics model filter"
                value={selectedModel}
                onChange={(event) => onModelChange(event.target.value)}
                className="h-9 min-w-44 appearance-none rounded-md border border-slate-300 bg-white px-3 py-1 pr-8 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
              >
                <option value="">All models</option>
                {modelOptions.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
              <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-slate-500 dark:text-slate-400" />
            </div>
            <div className="inline-flex rounded-md border bg-slate-100 p-1 dark:border-[#606066] dark:bg-[#29292c]">
              {[7, 30].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onDaysChange(option)}
                  className={cn(
                    "rounded px-3 py-1 text-xs font-medium transition",
                    days === option
                      ? "bg-white text-slate-950 shadow-sm dark:bg-[#45454a] dark:text-slate-50"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100",
                  )}
                >
                  {option}D
                </button>
              ))}
            </div>
            <Button type="button" variant="outline" size="icon" onClick={onRefresh} disabled={loading}>
              <RotateCcw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MetricSummaryCard
            label="Total requests"
            value={summary ? formatCompactNumber(summary.requests) : "-"}
            helper="Stored assistant responses"
          />
          <MetricSummaryCard
            label="Total token count"
            value={summary ? formatCompactNumber(summary.total_tokens) : "-"}
            helper={`${formatCompactNumber(summary?.avg_total_tokens ?? 0)} avg per request`}
          />
          <MetricSummaryCard
            label="Estimated total cost"
            value={summary ? formatCurrency(summary.estimated_cost) : "-"}
            helper="Set token rates in .env to estimate cost"
            info
          />
          <MetricSummaryCard
            label="Input tokens"
            value={summary ? formatCompactNumber(summary.prompt_tokens) : "-"}
            helper={`${formatCompactNumber(summary?.avg_prompt_tokens ?? 0)} avg per request`}
          />
          <MetricSummaryCard
            label="Output tokens"
            value={summary ? formatCompactNumber(summary.completion_tokens) : "-"}
            helper={`${formatCompactNumber(summary?.avg_completion_tokens ?? 0)} avg per request`}
          />
        </div>

        {!loading && summary?.requests === 0 ? (
          <div className="rounded-2xl border bg-white p-6 text-center text-sm text-slate-500 shadow-sm dark:border-[#606066] dark:bg-[#39393d] dark:text-slate-400">
            No model usage has been saved for this date range yet. Send a chat prompt and this
            dashboard will populate automatically.
          </div>
        ) : null}

        <MetricsChartCard
          title="Estimated cost"
          yLabel="Cost"
          days={metricDays}
          footer="Estimated from configured input and output token rates."
          series={[
            {
              label: "Estimated cost",
              color: "#b88a00",
              values: metricDays.map((item) => item.estimated_cost),
            },
          ]}
        />

        <div className="grid gap-4 xl:grid-cols-2">
          <MetricsChartCard
            title="Input vs output vs total tokens"
            description="Track token usage trends across input, output, and total."
            yLabel="Tokens"
            days={metricDays}
            footer={`Total: ${formatCompactNumber(summary?.total_tokens ?? 0)} tokens`}
            series={[
              {
                label: "Input tokens",
                color: "#5973ff",
                values: metricDays.map((item) => item.prompt_tokens),
              },
              {
                label: "Output tokens",
                color: "#ec6bd8",
                values: metricDays.map((item) => item.completion_tokens),
              },
              {
                label: "Total tokens",
                color: "#31c7b7",
                values: metricDays.map((item) => item.total_tokens),
              },
            ]}
          />
          <MetricsChartCard
            title="Number of requests"
            description="Shows how often this deployment was triggered."
            yLabel="Requests"
            days={metricDays}
            footer={`Total: ${formatCompactNumber(summary?.requests ?? 0)} requests`}
            area
            series={[
              {
                label: "Requests",
                color: "#5973ff",
                values: metricDays.map((item) => item.requests),
              },
            ]}
          />
          <MetricsChartCard
            title="Average response latency (ms)"
            description="Shows how long responses took to complete after each request."
            yLabel="Milliseconds"
            days={metricDays}
            footer={`Average: ${formatCompactNumber(summary?.avg_duration_ms ?? 0)} ms`}
            series={[
              {
                label: "Average latency",
                color: "#8b5cf6",
                values: metricDays.map((item) => item.avg_duration_ms),
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function MetricSummaryCard({
  label,
  value,
  helper,
  info = false,
}: {
  label: string;
  value: string;
  helper: string;
  info?: boolean;
}) {
  return (
    <Card className="rounded-2xl border-slate-200 bg-white shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
          {label}
          {info ? <HelpCircle className="h-3.5 w-3.5 text-slate-400" /> : null}
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{helper}</p>
      </CardContent>
    </Card>
  );
}

type ChartSeries = {
  label: string;
  color: string;
  values: number[];
};

function MetricsChartCard({
  title,
  description,
  yLabel,
  days,
  series,
  footer,
  area = false,
}: {
  title: string;
  description?: string;
  yLabel: string;
  days: MetricsDay[];
  series: ChartSeries[];
  footer: string;
  area?: boolean;
}) {
  return (
    <Card className="rounded-2xl border-slate-200 bg-white shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 p-4 pb-0">
        <div>
          <CardTitle className="text-sm">{title}</CardTitle>
          {description ? <CardDescription className="mt-1 text-xs">{description}</CardDescription> : null}
        </div>
        <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
          <CalendarDays className="h-4 w-4" />
          <BarChart3 className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <MetricsLineChart yLabel={yLabel} days={days} series={series} area={area} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>{footer}</span>
          <div className="flex flex-wrap items-center gap-3">
            {series.map((item) => (
              <span key={item.label} className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricsLineChart({
  yLabel,
  days,
  series,
  area,
}: {
  yLabel: string;
  days: MetricsDay[];
  series: ChartSeries[];
  area: boolean;
}) {
  const width = 760;
  const height = 260;
  const padding = { top: 18, right: 20, bottom: 44, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...series.flatMap((item) => item.values));
  const tickStep = days.length > 14 ? 4 : days.length > 8 ? 2 : 1;
  const xForIndex = (index: number) =>
    padding.left + (days.length <= 1 ? 0 : (index / (days.length - 1)) * plotWidth);
  const yForValue = (value: number) => padding.top + (1 - value / maxValue) * plotHeight;

  return (
    <svg className="h-64 w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img">
      <title>{yLabel} over time</title>
      {[0, 0.5, 1].map((tick) => {
        const y = padding.top + tick * plotHeight;
        const value = maxValue * (1 - tick);
        return (
          <g key={tick}>
            <line
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="currentColor"
              className="text-slate-200 dark:text-slate-600"
            />
            <text
              x={padding.left - 12}
              y={y + 4}
              textAnchor="end"
              className="fill-slate-500 text-[11px] dark:fill-slate-400"
            >
              {formatAxisNumber(value)}
            </text>
          </g>
        );
      })}

      <text
        x={18}
        y={padding.top + plotHeight / 2}
        transform={`rotate(-90 18 ${padding.top + plotHeight / 2})`}
        textAnchor="middle"
        className="fill-slate-500 text-[11px] font-medium dark:fill-slate-400"
      >
        {yLabel}
      </text>

      {series.map((item, seriesIndex) => {
        const points = item.values.map((value, index) => ({
          x: xForIndex(index),
          y: yForValue(value),
        }));
        const linePoints = points.map((point) => `${point.x},${point.y}`).join(" ");
        const areaPoints = [
          `${padding.left},${padding.top + plotHeight}`,
          ...points.map((point) => `${point.x},${point.y}`),
          `${padding.left + plotWidth},${padding.top + plotHeight}`,
        ].join(" ");
        return (
          <g key={item.label}>
            {area && seriesIndex === 0 ? (
              <polygon points={areaPoints} fill={item.color} opacity="0.25" />
            ) : null}
            <polyline points={linePoints} fill="none" stroke={item.color} strokeWidth="2.5" />
            {points.map((point, index) => (
              <circle key={`${item.label}-${index}`} cx={point.x} cy={point.y} r="2.5" fill={item.color} />
            ))}
          </g>
        );
      })}

      <line
        x1={padding.left}
        y1={padding.top + plotHeight}
        x2={width - padding.right}
        y2={padding.top + plotHeight}
        stroke="currentColor"
        className="text-slate-200 dark:text-slate-600"
      />
      {days.map((day, index) =>
        index % tickStep === 0 || index === days.length - 1 ? (
          <text
            key={day.date}
            x={xForIndex(index)}
            y={height - 18}
            textAnchor="middle"
            className="fill-slate-500 text-[11px] dark:fill-slate-400"
          >
            {day.label}
          </text>
        ) : null,
      )}
      <text
        x={padding.left + plotWidth / 2}
        y={height - 2}
        textAnchor="middle"
        className="fill-slate-500 text-[11px] dark:fill-slate-400"
      >
        Date (MM/DD)
      </text>
    </svg>
  );
}

function ChatMessageHistory({ messages }: { messages: ChatMessage[] }) {
  const turns = groupComparisonTurns(messages);
  return (
    <>
      {turns.map((turn) => {
        const isGuardrailComparison = turn.responses.some(
          (response) => response.guardrail_variant,
        );
        return (
          <div key={turn.user.id} className="grid gap-4">
            <ChatBubble message={turn.user} />
            {isGuardrailComparison ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {(["baseline", "guarded"] as const).map((variant) => {
                  const response = turn.responses.find(
                    (item) => item.guardrail_variant === variant,
                  );
                  return response ? <ChatBubble key={response.id} message={response} /> : null;
                })}
              </div>
            ) : (
              turn.responses.map((response) => (
                <ChatBubble key={response.id} message={response} />
              ))
            )}
          </div>
        );
      })}
    </>
  );
}


function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const copyText = message.error ?? message.content;
  const timestamp = formatMessageDateTime(message.created_at);

  async function copyMessage() {
    await navigator.clipboard.writeText(copyText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className={cn("group flex items-end gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <div className="mb-6 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-white shadow-sm">
          <Bot className="h-4 w-4" />
        </div>
      ) : null}

      <div className={cn("flex max-w-[min(44rem,82%)] flex-col", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "mb-1 flex flex-wrap items-center gap-2 px-2 text-[11px]",
            isUser ? "justify-end text-slate-500 dark:text-slate-300" : "text-slate-500 dark:text-slate-400",
          )}
        >
          <span className={cn("font-semibold", isUser ? "text-slate-600 dark:text-slate-200" : "text-slate-700 dark:text-slate-200")}>
            {isUser ? "You" : message.model ?? "Assistant"}
          </span>
          {timestamp ? <span>{timestamp}</span> : null}
          {!isUser && message.api_surface ? (
            <Badge variant="secondary">{formatApiSurface(message.api_surface)}</Badge>
          ) : null}
          {!isUser && message.guardrail_variant ? (
            <Badge variant={message.guardrail_variant === "guarded" ? "default" : "outline"}>
              {message.guardrail_variant === "guarded"
                ? message.guardrail_policy_name ?? "Custom guardrail"
                : "Deployment default"}
            </Badge>
          ) : null}
          {!isUser && message.duration_ms ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {message.duration_ms} ms
            </span>
          ) : null}
          {!isUser && formatUsage(message.usage) ? <span>{formatUsage(message.usage)}</span> : null}
        </div>

        {!isUser && message.guardrail_results ? (
          <details className="mt-1 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-300">
            <summary className="cursor-pointer font-medium">Guardrail annotations</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">
              {JSON.stringify(message.guardrail_results, null, 2)}
            </pre>
          </details>
        ) : null}

        <div
          className={cn(
            "relative rounded-[1.35rem] px-4 py-3 text-sm shadow-sm transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md",
            "after:absolute after:bottom-3 after:h-3 after:w-3 after:rotate-45",
            isUser
              ? "rounded-br-md bg-gradient-to-br from-blue-600 to-violet-600 text-white after:-right-1 after:bg-violet-600"
              : "rounded-bl-md border border-slate-200 bg-slate-100 text-slate-900 after:-left-1 after:border-b after:border-l after:border-slate-200 after:bg-slate-100 dark:border-slate-600 dark:bg-slate-100 dark:text-slate-950 dark:after:border-slate-600 dark:after:bg-slate-100",
            message.error &&
              "border-red-200 bg-red-50 text-red-900 after:bg-red-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100 dark:after:bg-red-950",
          )}
        >
          <div className="whitespace-pre-wrap leading-6">{copyText}</div>
        </div>

        <button
          type="button"
          onClick={() => void copyMessage()}
          className={cn(
            "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] opacity-0 transition hover:bg-slate-100 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:hover:bg-[#45454a] dark:focus-visible:ring-violet-500",
            isUser ? "text-slate-500 dark:text-slate-300" : "text-slate-500 dark:text-slate-400",
          )}
          aria-label={`Copy ${isUser ? "request" : "response"}`}
          title={`Copy ${isUser ? "request" : "response"}`}
        >
          {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {isUser ? (
        <div className="mb-6 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700 shadow-sm dark:bg-[#45454a] dark:text-slate-200">
          <User className="h-4 w-4" />
        </div>
      ) : null}
    </div>
  );
}

type ComparisonWorkspaceProps = {
  allModels: string[];
  models: string[];
  messages: ChatMessage[];
  prompt: string;
  isRunning: boolean;
  canSubmit: boolean;
  speechRecognitionSupported: boolean;
  isListening: boolean;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onToggleDictation: () => void;
  onOpenSettings: (model: string) => void;
  onModelChange: (currentModel: string, nextModel: string) => void;
};

function ComparisonWorkspace({
  allModels,
  models,
  messages,
  prompt,
  isRunning,
  canSubmit,
  speechRecognitionSupported,
  isListening,
  onPromptChange,
  onSubmit,
  onToggleDictation,
  onOpenSettings,
  onModelChange,
}: ComparisonWorkspaceProps) {
  const turns = groupComparisonTurns(messages);

  if (!models.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <div className="max-w-md">
          <GitCompareArrows className="mx-auto mb-4 h-10 w-10 text-slate-300 dark:text-[#77777d]" />
          <h3 className="text-lg font-semibold">Select models to compare</h3>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Turn on one or more model endpoints in the comparison list to start side-by-side
            testing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-100/70 dark:bg-[#303033]">
      <div className="flex-1 overflow-x-auto p-4">
        <div
          className="grid h-full min-w-[44rem] gap-4"
          style={{
            gridTemplateColumns: `repeat(${models.length}, minmax(20rem, 1fr))`,
          }}
        >
          {models.map((model) => (
            <ComparisonModelPane
              key={model}
              allModels={allModels}
              selectedModels={models}
              model={model}
              turns={turns}
              prompt={prompt}
              isRunning={isRunning}
              canSubmit={canSubmit}
              speechRecognitionSupported={speechRecognitionSupported}
              isListening={isListening}
              onPromptChange={onPromptChange}
              onSubmit={onSubmit}
              onToggleDictation={onToggleDictation}
              onOpenSettings={onOpenSettings}
              onModelChange={onModelChange}
            />
          ))}
        </div>
      </div>
      <p className="border-t bg-white px-4 py-2 text-center text-xs text-slate-500 dark:border-[#55555a] dark:bg-[#29292c] dark:text-slate-400">
        Text typed in any comparison prompt is mirrored to every pane. Sending dispatches the
        same prompt to all selected models.
      </p>
    </div>
  );
}

type ComparisonModelPaneProps = {
  allModels: string[];
  selectedModels: string[];
  model: string;
  turns: Array<{ user: ChatMessage; responses: ChatMessage[] }>;
  prompt: string;
  isRunning: boolean;
  canSubmit: boolean;
  speechRecognitionSupported: boolean;
  isListening: boolean;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onToggleDictation: () => void;
  onOpenSettings: (model: string) => void;
  onModelChange: (currentModel: string, nextModel: string) => void;
};

function ComparisonModelPane({
  allModels,
  selectedModels,
  model,
  turns,
  prompt,
  isRunning,
  canSubmit,
  speechRecognitionSupported,
  isListening,
  onPromptChange,
  onSubmit,
  onToggleDictation,
  onOpenSettings,
  onModelChange,
}: ComparisonModelPaneProps) {
  function submitPanePrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      onSubmit={submitPanePrompt}
      className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm dark:border-[#606066] dark:bg-[#39393d]"
    >
      <header className="flex items-center gap-2 border-b px-3 py-3 dark:border-[#55555a]">
        <div className="relative min-w-0 flex-1">
          <select
            aria-label={`Model for comparison pane ${model}`}
            value={model}
            onChange={(event) => onModelChange(model, event.target.value)}
            className="h-9 w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-1 pr-8 text-sm font-medium shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
          >
            {allModels.map((option) => (
              <option
                key={option}
                value={option}
                disabled={option !== model && selectedModels.includes(option)}
              >
                {option}
              </option>
            ))}
          </select>
          <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-slate-500 dark:text-slate-400" />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onOpenSettings(model)}
          title={`Open settings for ${model}`}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex-1 overflow-auto bg-slate-50 p-4 dark:bg-[#303033]">
        {turns.length ? (
          <div className="grid gap-4">
            {turns.map((turn) => {
              const responses = turn.responses.filter((item) => item.model === model);
              return (
                <section key={turn.user.id} className="grid gap-2">
                  <div className="ml-auto max-w-[90%] rounded-2xl bg-blue-600 px-3 py-2 text-sm leading-6 text-white shadow-sm dark:bg-violet-600">
                    {turn.user.content}
                  </div>
                  {responses.length ? (
                    <div className="grid gap-2">
                      {responses.map((response) => (
                        <ComparisonModelResponse key={response.id} message={response} />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border bg-white px-3 py-2 text-sm text-slate-500 shadow-sm dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-400">
                      Waiting for this model...
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-center">
            <div className="max-w-xs">
              <Bot className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-[#77777d]" />
              <h3 className="text-sm font-semibold">Ready for {model}</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Type in any pane below. Every input stays synchronized.
              </p>
            </div>
          </div>
        )}
      </div>

      <footer className="border-t bg-white p-3 dark:border-[#55555a] dark:bg-[#29292c]">
        <Textarea
          aria-label={`Prompt for ${model}`}
          placeholder="Ask all selected models..."
          value={prompt}
          rows={3}
          onChange={(event) => onPromptChange(event.target.value)}
          className="min-h-20 resize-none"
        />
        <div className="mt-2 flex justify-end gap-2">
          <Button
            type="button"
            variant={isListening ? "destructive" : "outline"}
            size="icon"
            disabled={!speechRecognitionSupported}
            onClick={onToggleDictation}
            title={
              isListening
                ? "Stop browser dictation"
                : "Start browser dictation (speech-to-text into the prompt)"
            }
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Button type="submit" size="icon" disabled={!canSubmit}>
            {isRunning ? <RotateCcw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </footer>
    </form>
  );
}

function ComparisonModelResponse({ message }: { message: ChatMessage }) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-white px-3 py-3 text-sm leading-6 shadow-sm dark:border-[#606066] dark:bg-[#29292c]",
        message.error && "border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        {message.api_surface ? (
          <Badge variant="secondary">{formatApiSurface(message.api_surface)}</Badge>
        ) : null}
        {message.guardrail_variant ? (
          <Badge variant={message.guardrail_variant === "guarded" ? "default" : "outline"}>
            {message.guardrail_variant === "guarded"
              ? message.guardrail_policy_name ?? "Custom guardrail"
              : "Deployment default"}
          </Badge>
        ) : null}
        {message.duration_ms ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {message.duration_ms} ms
          </span>
        ) : null}
        {formatUsage(message.usage) ? <span>{formatUsage(message.usage)}</span> : null}
      </div>
      <div className="whitespace-pre-wrap text-slate-900 dark:text-slate-100">
        {message.error ?? message.content}
      </div>
      {message.guardrail_results ? (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer font-medium">Guardrail annotations</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap">
            {JSON.stringify(message.guardrail_results, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function groupComparisonTurns(messages: ChatMessage[]) {
  const turns: Array<{ user: ChatMessage; responses: ChatMessage[] }> = [];

  for (const message of messages) {
    if (message.role === "user") {
      turns.push({ user: message, responses: [] });
    } else if (turns.length) {
      turns[turns.length - 1].responses.push(message);
    }
  }

  return turns;
}

type SettingsModalProps = {
  model: string;
  draft: ModelSettings | null;
  saving: boolean;
  policies: GuardrailPolicy[];
  deploymentPolicy: DeploymentGuardrailPolicy | null;
  policiesLoading: boolean;
  error: string;
  onClose: () => void;
  onSave: () => void;
  onReset: () => void;
  onChange: (patch: Partial<ModelSettings>) => void;
};

function SettingsModal({
  model,
  draft,
  saving,
  policies,
  deploymentPolicy,
  policiesLoading,
  error,
  onClose,
  onSave,
  onReset,
  onChange,
}: SettingsModalProps) {
  const selectablePolicies = policies.filter((policy) => policy.is_selectable);
  function toggleModality(modality: ModelModality) {
    if (!draft) {
      return;
    }
    const next = draft.modalities.includes(modality)
      ? draft.modalities.filter((item) => item !== modality)
      : [...draft.modalities, modality];
    onChange({ modalities: next.length ? next : [modality] });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#303033]/60 p-4">
      <Card className="max-h-[90vh] w-full max-w-2xl overflow-auto bg-white text-slate-950 dark:border-[#606066] dark:bg-[#39393d] dark:text-slate-50">
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Model settings</CardTitle>
              <CardDescription>{model}</CardDescription>
            </div>
            <button
              type="button"
              className="rounded p-1 hover:bg-slate-100 dark:hover:bg-[#45454a]"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>

        {draft ? (
          <>
            <CardContent className="grid gap-6 pt-6">
              <section className="grid gap-2">
                <div>
                  <h3 className="font-semibold">API surface</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Responses is the default for OpenAI/GPT deployments. Use Chat Completions
                    for deployments such as Kimi that document that API.
                  </p>
                </div>
                <select
                  value={draft.api_surface}
                  onChange={(event) =>
                    onChange({
                      api_surface: event.target.value as ModelSettings["api_surface"],
                    })
                  }
                  className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
                >
                  <option value="responses">Responses API</option>
                  <option value="chat_completions">Chat Completions API</option>
                </select>
              </section>

              <section className="grid gap-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-violet-500/40 dark:bg-violet-500/10">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">Guardrail experiment</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Compare the deployment default with a custom Foundry guardrail using the same
                      model and prompt.
                    </p>
                  </div>
                  <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={draft.guardrails_enabled}
                      onChange={(event) =>
                        onChange({
                          guardrails_enabled: event.target.checked,
                          guardrail_policy_name: event.target.checked
                            ? draft.guardrail_policy_name
                            : null,
                        })
                      }
                      className="h-4 w-4 accent-blue-600"
                    />
                    Enabled
                  </label>
                </div>
                <div className="rounded-lg border border-blue-200 bg-white/80 px-3 py-2 dark:border-violet-500/30 dark:bg-[#29292c]">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Deployment guardrail
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {deploymentPolicy?.policy_name ?? "Service default"}
                    </Badge>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Currently assigned to {model}
                    </span>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="guardrail-policy">Custom guardrail</Label>
                  <select
                    id="guardrail-policy"
                    value={draft.guardrail_policy_name ?? ""}
                    disabled={!draft.guardrails_enabled || policiesLoading}
                    onChange={(event) =>
                      onChange({ guardrail_policy_name: event.target.value || null })
                    }
                    className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
                  >
                    <option value="">
                      {policiesLoading ? "Loading Foundry guardrails..." : "Select a guardrail"}
                    </option>
                    {selectablePolicies.map((policy) => (
                      <option key={policy.name} value={policy.name}>
                        {policy.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Baseline: deployment-assigned Microsoft default policy. Custom policies are
                    retrieved live from Foundry.
                  </p>
                  {!policiesLoading && !selectablePolicies.length ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      No custom guardrails are available. This deployment continues to use{" "}
                      {deploymentPolicy?.policy_name ?? "its service default"}.
                    </p>
                  ) : null}
                </div>
              </section>

              <section className="grid gap-2">
                <div>
                  <h3 className="font-semibold">Model capabilities</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Tag what this deployment is meant for so the UI can later show the right
                    models for text, image, or voice workflows.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {modelModalities.map((modality) => (
                    <button
                      key={modality}
                      type="button"
                      onClick={() => toggleModality(modality)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm capitalize transition",
                        draft.modalities.includes(modality)
                          ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-violet-500/60 dark:bg-violet-500/15 dark:text-violet-200"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-[#606066] dark:text-slate-300 dark:hover:bg-[#45454a]",
                      )}
                    >
                      <Tags className="h-3.5 w-3.5" />
                      {modality}
                    </button>
                  ))}
                </div>
              </section>

              <section className="grid gap-2">
                <div>
                  <h3 className="font-semibold">Instructions</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Stored separately for this model endpoint and sent as the system prompt.
                  </p>
                </div>
                <Textarea
                  rows={5}
                  value={draft.system_prompt}
                  onChange={(event) => onChange({ system_prompt: event.target.value })}
                />
              </section>

              <section className="grid gap-4">
                <div>
                  <h3 className="font-semibold">Parameters</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    These settings are saved per deployment endpoint.
                  </p>
                </div>
                <SliderField
                  label="Temperature"
                  description="Controls randomness. Lower is more focused, higher is more creative."
                  min={0}
                  max={2}
                  step={0.1}
                  value={draft.temperature}
                  onChange={(temperature) => onChange({ temperature })}
                />
                <SliderField
                  label="Top P"
                  description="Nucleus sampling. Controls diversity of word choices."
                  min={0.01}
                  max={1}
                  step={0.01}
                  value={draft.top_p}
                  onChange={(top_p) => onChange({ top_p })}
                />
                <SliderField
                  label="Max Tokens"
                  description="Maximum length of the response."
                  min={1}
                  max={4096}
                  step={1}
                  value={draft.max_tokens}
                  onChange={(max_tokens) => onChange({ max_tokens })}
                />
                <SliderField
                  label="Repetition Penalty"
                  description="Reduces repetitive text. Higher values mean less repetition."
                  min={1}
                  max={2}
                  step={0.1}
                  value={draft.repetition_penalty}
                  onChange={(repetition_penalty) => onChange({ repetition_penalty })}
                />
              </section>
            </CardContent>

            {error ? (
              <div className="mx-6 mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
                {error}
              </div>
            ) : null}

            <CardFooter className="flex flex-col gap-3 border-t bg-slate-50 sm:flex-row sm:justify-between dark:border-[#55555a] dark:bg-[#29292c]">
              <Button type="button" variant="outline" onClick={onReset}>
                <RotateCcw className="h-4 w-4" />
                Reset to defaults
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Close
                </Button>
                <Button
                  type="button"
                  onClick={onSave}
                  disabled={
                    saving ||
                    (draft.guardrails_enabled && !draft.guardrail_policy_name)
                  }
                >
                  {saving ? "Saving..." : "Save settings"}
                </Button>
              </div>
            </CardFooter>
          </>
        ) : (
          <CardContent className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Loading settings...
          </CardContent>
        )}
      </Card>
    </div>
  );
}

type AdminDeploymentModalProps = {
  config: AdminConfig | null;
  draft: AdminDeploymentDraft;
  deploying: boolean;
  message: { type: "success" | "error"; text: string } | null;
  onClose: () => void;
  onCreate: () => void;
  onChange: (patch: Partial<AdminDeploymentDraft>) => void;
};

function AdminDeploymentModal({
  config,
  draft,
  deploying,
  message,
  onClose,
  onCreate,
  onChange,
}: AdminDeploymentModalProps) {
  function toggleModality(modality: ModelModality) {
    const next = draft.modalities.includes(modality)
      ? draft.modalities.filter((item) => item !== modality)
      : [...draft.modalities, modality];
    onChange({ modalities: next.length ? next : [modality] });
  }

  const canCreate =
    Boolean(config?.is_configured) &&
    Boolean(draft.deployment_name.trim()) &&
    Boolean(draft.model_name.trim()) &&
    Boolean(draft.model_version.trim()) &&
    !deploying;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#303033]/60 p-4">
      <Card className="max-h-[90vh] w-full max-w-3xl overflow-auto bg-white text-slate-950 dark:border-[#606066] dark:bg-[#39393d] dark:text-slate-50">
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Foundry deployment admin</CardTitle>
              <CardDescription>
                Create Azure AI Foundry model deployments without opening the portal.
              </CardDescription>
            </div>
            <button
              type="button"
              className="rounded p-1 hover:bg-slate-100 dark:hover:bg-[#45454a]"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>

        <CardContent className="grid gap-6 pt-6">
          <section className="rounded-lg border bg-slate-50 p-3 dark:border-[#606066] dark:bg-[#29292c]">
            <div className="flex items-start gap-2">
              {config?.is_configured ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
              )}
              <div className="grid gap-1 text-sm">
                <p className="font-medium">
                  {config === null
                    ? "Loading Azure target..."
                    : config.is_configured
                      ? "Azure target configured"
                      : "Azure target missing configuration"}
                </p>
                {config ? (
                  config.is_configured ? (
                    <p className="break-all text-xs text-slate-500 dark:text-slate-400">
                      {config.subscription_id} / {config.resource_group} / {config.account_name}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Add {config.missing.join(", ")} to your `.env`.
                    </p>
                  )
                ) : null}
              </div>
            </div>
          </section>

          {message ? (
            <div
              className={cn(
                "rounded-lg border p-3 text-sm",
                message.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100"
                  : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100",
              )}
            >
              {message.text}
            </div>
          ) : null}

          <section className="grid gap-4 md:grid-cols-2">
            <Field label="Deployment name">
              <Input
                value={draft.deployment_name}
                placeholder="gpt-5.5"
                onChange={(event) => onChange({ deployment_name: event.target.value })}
              />
            </Field>
            <Field label="Base model name">
              <Input
                value={draft.model_name}
                placeholder="gpt-4o"
                onChange={(event) => onChange({ model_name: event.target.value })}
              />
            </Field>
            <Field label="Model version">
              <Input
                value={draft.model_version}
                placeholder="2024-11-20"
                onChange={(event) => onChange({ model_version: event.target.value })}
              />
            </Field>
            <Field label="Model format">
              <select
                value={draft.model_format}
                onChange={(event) => onChange({ model_format: event.target.value })}
                className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
              >
                <option value="OpenAI">OpenAI</option>
                <option value="Microsoft">Microsoft</option>
              </select>
            </Field>
            <Field label="SKU name">
              <select
                value={draft.sku_name}
                onChange={(event) => onChange({ sku_name: event.target.value })}
                className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
              >
                <option value="Standard">Standard</option>
                <option value="GlobalStandard">GlobalStandard</option>
                <option value="GlobalBatch">GlobalBatch</option>
                <option value="ProvisionedManaged">ProvisionedManaged</option>
              </select>
            </Field>
            <Field label="SKU capacity">
              <Input
                type="number"
                min={1}
                value={draft.sku_capacity}
                onChange={(event) => onChange({ sku_capacity: Number(event.target.value) })}
              />
            </Field>
            <Field label="Version upgrade option">
              <select
                value={draft.version_upgrade_option}
                onChange={(event) => onChange({ version_upgrade_option: event.target.value })}
                className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
              >
                <option value="OnceNewDefaultVersionAvailable">Once new default version is available</option>
                <option value="OnceCurrentVersionExpired">Once current version expires</option>
                <option value="NoAutoUpgrade">No auto upgrade</option>
              </select>
            </Field>
            <Field label="RAI policy name">
              <Input
                value={draft.rai_policy_name}
                placeholder="Optional"
                onChange={(event) => onChange({ rai_policy_name: event.target.value })}
              />
            </Field>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <Field label="Default API surface">
              <select
                value={draft.api_surface}
                onChange={(event) =>
                  onChange({ api_surface: event.target.value as ModelSettings["api_surface"] })
                }
                className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
              >
                <option value="responses">Responses API</option>
                <option value="chat_completions">Chat Completions API</option>
              </select>
            </Field>
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-200">Model capabilities</Label>
              <div className="flex flex-wrap gap-2">
                {modelModalities.map((modality) => (
                  <button
                    key={modality}
                    type="button"
                    onClick={() => toggleModality(modality)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm capitalize transition",
                      draft.modalities.includes(modality)
                        ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-violet-500/60 dark:bg-violet-500/15 dark:text-violet-200"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-[#606066] dark:text-slate-300 dark:hover:bg-[#45454a]",
                    )}
                  >
                    <Tags className="h-3.5 w-3.5" />
                    {modality}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <label className="flex items-start gap-2 rounded-lg border p-3 text-sm dark:border-[#606066]">
            <input
              type="checkbox"
              checked={draft.wait_for_completion}
              onChange={(event) => onChange({ wait_for_completion: event.target.checked })}
              className="mt-1"
            />
            <span>
              Wait for Azure to finish provisioning before returning. Leave this off for long-running
              deployments.
            </span>
          </label>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 border-t bg-slate-50 sm:flex-row sm:justify-between dark:border-[#55555a] dark:bg-[#29292c]">
          <Button type="button" variant="outline" onClick={() => onChange(defaultDeploymentDraft)}>
            <RotateCcw className="h-4 w-4" />
            Reset form
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button type="button" onClick={onCreate} disabled={!canCreate}>
              {deploying ? "Creating..." : "Create deployment"}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label className="text-slate-700 dark:text-slate-200">{label}</Label>
      {children}
    </div>
  );
}

type SliderFieldProps = {
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
};

function SliderField({ label, description, min, max, step, value, onChange }: SliderFieldProps) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-4">
        <Label className="text-slate-700 dark:text-slate-200">{label}</Label>
        <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-blue-600 dark:bg-[#606066] dark:accent-violet-400"
      />
      <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
}

function createUserMessage(content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    content,
    created_at: new Date().toISOString(),
  };
}

function createAssistantMessage(result: ModelResult): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    model: result.model,
    api_surface: result.api_surface,
    content: result.content ?? "",
    created_at: new Date().toISOString(),
    duration_ms: result.duration_ms,
    usage: result.usage,
    error: result.error,
    guardrail_variant: result.guardrail_variant,
    guardrail_policy_name: result.guardrail_policy_name,
    guardrail_results: result.guardrail_results,
  };
}

function mapStoredMessage(message: StoredMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    created_at: message.created_at,
    model: message.model ?? undefined,
    api_surface: message.api_surface ?? undefined,
    duration_ms: message.duration_ms ?? undefined,
    usage: message.usage ?? undefined,
    error: message.error ?? undefined,
    guardrail_variant: message.guardrail_variant,
    guardrail_policy_name: message.guardrail_policy_name,
    guardrail_results: message.guardrail_results,
  };
}

async function readServerSentEvents(
  response: Response,
  onEvent: (event: ChatStreamEvent) => void,
) {
  if (!response.body) {
    throw new Error("Streaming response body is not available.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const parsedEvents: ChatStreamEvent[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const parsedEvent = parseServerSentEvent(event, onEvent);
      if (parsedEvent) {
        parsedEvents.push(parsedEvent);
      }
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const parsedEvent = parseServerSentEvent(buffer, onEvent);
    if (parsedEvent) {
      parsedEvents.push(parsedEvent);
    }
  }
  return parsedEvents;
}

function parseServerSentEvent(
  rawEvent: string,
  onEvent: (event: ChatStreamEvent) => void,
): ChatStreamEvent | null {
  const data = rawEvent
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");
  if (!data) {
    return null;
  }
  const parsedEvent = JSON.parse(data) as ChatStreamEvent;
  onEvent(parsedEvent);
  return parsedEvent;
}

function parseRequestBody(body: BodyInit | null | undefined) {
  if (typeof body !== "string") {
    return undefined;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

function base64ToBlob(base64: string, mimeType: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function summarizeTraditionalVoiceResult(result: TraditionalVoiceResult) {
  return {
    model: result.model,
    transcription: {
      model: result.transcription.model,
      text: result.transcription.text,
      duration_ms: result.transcription.duration_ms,
    },
    results: result.results.map((variant) => ({
      model: variant.model,
      guardrail_variant: variant.guardrail_variant,
      guardrail_policy_name: variant.guardrail_policy_name,
      api_surface: variant.api_surface,
      content: variant.content,
      error: variant.error,
      duration_ms: variant.duration_ms,
      usage: variant.usage,
      speech: variant.speech
        ? {
            model: variant.speech.model,
            voice: variant.speech.voice,
            audio_mime_type: variant.speech.audio_mime_type,
            audio_base64_bytes: variant.speech.audio_base64.length,
            duration_ms: variant.speech.duration_ms,
          }
        : null,
      speech_error: variant.speech_error,
    })),
    conversation: result.conversation,
  };
}

async function readTraceResponse(response: Response, responseKind?: "json" | "text" | "stream") {
  if (responseKind === "stream") {
    return "text/event-stream";
  }

  const clone = response.clone();
  const contentType = clone.headers.get("content-type") ?? "";
  if (responseKind === "json" || contentType.includes("application/json")) {
    try {
      return (await clone.json()) as unknown;
    } catch {
      return `${response.status} ${response.statusText}`;
    }
  }
  if (responseKind === "text" || contentType.startsWith("text/")) {
    return clone.text();
  }
  return `${response.status} ${response.statusText}`;
}

function formatTraceTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function formatMessageDateTime(timestamp?: string) {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isMessageTraceEntry(entry: ApiTraceEntry) {
  if (entry.direction === "api_foundry" || entry.direction === "foundry_api") {
    return true;
  }
  return (
    entry.url.startsWith("/api/chat") ||
    entry.url.startsWith("/api/compare") ||
    entry.url.startsWith("/api/documents") ||
    entry.url.startsWith("/api/voice")
  );
}

function formatTraceDirection(direction: ApiTraceEntry["direction"]) {
  if (direction === "api_foundry") {
    return "API -> Foundry";
  }
  if (direction === "foundry_api") {
    return "Foundry -> API";
  }
  if (direction === "api_frontend") {
    return "API -> Frontend";
  }
  return "Frontend -> API";
}

function formatTraceValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  const formatted = JSON.stringify(value, null, 2);
  return formatted ?? String(value);
}

function formatApiSurface(apiSurface: string) {
  if (apiSurface === "responses") {
    return "Responses API";
  }
  if (apiSurface === "chat_completions") {
    return "Chat Completions API";
  }
  if (apiSurface === "embeddings") {
    return "Embeddings API";
  }
  return apiSurface;
}

function formatUsage(usage?: Usage) {
  if (!usage || usage.total_tokens === null || usage.total_tokens === undefined) {
    return "";
  }

  return `${usage.total_tokens} tokens`;
}

function formatCompactNumber(value: number) {
  if (value >= 1_000_000) {
    return `${trimTrailingZeroes(value / 1_000_000)}M`;
  }

  if (value >= 1_000) {
    return `${trimTrailingZeroes(value / 1_000)}K`;
  }
  return String(Math.round(value));
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${trimTrailingZeroes(value / 1024)} KB`;
  }
  return `${trimTrailingZeroes(value / (1024 * 1024))} MB`;
}

function formatAxisNumber(value: number) {
  if (value === 0) {
    return "0";
  }
  if (value < 1) {
    return value.toFixed(2);
  }
  return formatCompactNumber(value);
}

function formatCurrency(value: number) {
  if (value === 0) {
    return "$0";
  }
  if (value > 0 && value < 0.01) {
    return "<$0.01";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function trimTrailingZeroes(value: number) {
  return value.toFixed(value >= 10 ? 1 : 2).replace(/\.?0+$/, "");
}
