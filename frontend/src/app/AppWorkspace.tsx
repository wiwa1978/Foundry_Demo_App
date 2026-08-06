import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  ChevronsUpDown,
  Clock,
  GitCompareArrows,
  HelpCircle,
  Infinity as InfinityIcon,
  LogIn,
  LogOut,
  Mic,
  MicOff,
  Moon,
  Network,
  Plus,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Sun,
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { ComparisonWorkspace } from "@/features/comparison/ComparisonWorkspace";
import { GuardrailComparisonWorkspace } from "@/features/guardrails/GuardrailWorkspaces";
import {
  ImageComparisonWorkspace,
  ImageToImageWorkspace,
  TextToImageWorkspace,
} from "@/features/images/ImageWorkspaces";
import { UseCaseMarketplace } from "@/features/marketplace/UseCaseMarketplace";
import { ChatMessageHistory } from "@/features/textChat/ChatMessages";
import { useTextChatRequest } from "@/features/textChat/useTextChatRequest";
import {
  listDocuments,
  removeDocument,
  streamDocumentAnswer,
  uploadDocuments as uploadDocumentFiles,
} from "@/features/documentQa/api";
import type { DocumentSummary } from "@/features/documentQa/types";
import {
  createRealtimeSession,
  liveInterpreterUrl,
  transcribeRecording,
  voiceLiveUrl,
} from "@/features/voice/api";
import { editImage, generateImage } from "@/features/images/api";
import { compareModels } from "@/features/comparison/api";
import type {
  ChatMessage,
  Conversation,
  FoundryRequestTrace,
  FoundryResponseTrace,
  ModelResult,
  ReasoningEffort,
  StoredMessage,
} from "@/features/textChat/types";
import { UseCaseDetailsPanel } from "@/features/useCases/UseCaseDetailsPanel";
import {
  LiveTranslationHero,
  RealtimeVoiceHero,
  SidebarPipelineSelect,
  TraditionalVoiceWorkspace,
  TranscriptionWorkspace,
  VoiceLiveHero,
} from "@/features/voice/VoiceWorkspaces";
import { cn } from "@/lib/utils";
import { readStorage, writeStorage } from "@/lib/storage";
import { toast } from "sonner";

import {
  colorPalettes,
  colorPaletteStorageKey,
  defaultComparisonModelCount,
  defaultDeploymentDraft,
  defaultSettings,
  deploymentDefaultGuardrail,
  isImageModelName,
  isTranscriptionModelName,
  maxComparisonModelCount,
  maxImageComparisonModelCount,
  reasoningEffortOptions,
  speechVoiceStorageKey,
  traditionalTtsVoices,
  voiceModelStorageKey,
  voiceReadbackStorageKey,
} from "@/app/workspace/constants";
import { AdminDeploymentModal } from "@/app/workspace/AdminDeploymentModal";
import { AppSettingsPage } from "@/app/workspace/AppSettingsPage";
import { ApiTraceDrawer } from "@/app/workspace/ApiTraceDrawer";
import type {
  AdminConfig,
  AdminDeploymentDraft,
  ApiTraceEntry,
  ApiTraceFilter,
  AuthResponse,
  BrowserSpeechRecognition,
  ColorPalette,
  ConfigResponse,
  ContextMenuState,
  DeploymentGuardrailPolicy,
  GuardrailPolicy,
  ImageGenerationResult,
  LiveInterpreterServerEvent,
  ModelMetrics,
  ModelModality,
  ModelsResponse,
  ModelSettings,
  RealtimeServerEvent,
  RealtimeSessionResponse,
  RealtimeStatus,
  RealtimeTranscriptEntry,
  StatusMessage,
  Theme,
  TracedFetchOptions,
  TraditionalVoiceResult,
  TraditionalVoiceStatus,
  TranscriptionResult,
  ViewMode,
  VoiceLiveServerEvent,
} from "@/app/workspace/contracts";
import {
  formatBytes,
  formatConfiguredGuardrail,
  formatModelName,
} from "@/app/workspace/formatters";
import { ModelSettingsPage } from "@/app/workspace/ModelSettingsPage";
import { ModelMetricsDashboard } from "@/app/workspace/ModelMetricsDashboard";
import {
  ChatEmptyState,
  ComposerSelect,
  FoundryStatusPill,
  SidebarSection,
  UseCaseComposer,
} from "@/app/workspace/WorkspacePrimitives";
import {
  createAssistantMessage,
  createUserMessage,
  mapStoredMessage,
} from "@/app/workspace/messageUtils";
import {
  formatApiSurface,
  parseRequestBody,
  readTraceResponse,
  redactTracePayload,
} from "@/app/workspace/traceUtils";
import {
  convertAudioToWav,
  summarizeTraditionalVoiceResult,
} from "@/features/voice/audioUtils";

export default function AppWorkspace() {
  const textChatRequest = useTextChatRequest();
  const documentRequestControllerRef = useRef<AbortController | null>(null);
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [modelModalities, setModelModalities] = useState<Record<string, ModelModality[]>>({});
  const [activeModel, setActiveModel] = useState("");
  const [transcriptionModels, setTranscriptionModels] = useState<string[]>([]);
  const [transcriptionModel, setTranscriptionModel] = useState("");
  const [traditionalTranscriptionModels, setTraditionalTranscriptionModels] = useState<string[]>([]);
  const [traditionalTranscriptionModel, setTraditionalTranscriptionModel] = useState("");
  const [ttsModels, setTtsModels] = useState<string[]>([]);
  const [ttsModel, setTtsModel] = useState("");
  const [ttsVoice, setTtsVoice] = useState("alloy");
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [newModel, setNewModel] = useState("");
  const [modelEndpointMessage, setModelEndpointMessage] = useState<StatusMessage | null>(null);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [activeUseCase, setActiveUseCase] = useState<UseCaseId>("text_chat");
  const [useCaseMarketplaceOpen, setUseCaseMarketplaceOpen] = useState(false);
  const [useCaseDetailsOpen, setUseCaseDetailsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageSize, setImageSize] = useState("1024x1024");
  const [imageResult, setImageResult] = useState<ImageGenerationResult | null>(null);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [imageError, setImageError] = useState("");
  const [imageEditSource, setImageEditSource] = useState<File | null>(null);
  const [imageEditResult, setImageEditResult] = useState<ImageGenerationResult | null>(null);
  const [imageEditGenerating, setImageEditGenerating] = useState(false);
  const [imageEditError, setImageEditError] = useState("");
  const [selectedImageModels, setSelectedImageModels] = useState<Set<string>>(new Set());
  const [imageComparisonResults, setImageComparisonResults] = useState<Record<string, ImageGenerationResult>>({});
  const [imageComparisonErrors, setImageComparisonErrors] = useState<Record<string, string>>({});
  const [imageComparisonGenerating, setImageComparisonGenerating] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("default");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const useCaseSessionRef = useRef(0);
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
  const [guardrailComparisonEnabled, setGuardrailComparisonEnabled] = useState(false);
  const [activeGuardrailPolicies, setActiveGuardrailPolicies] = useState<string[]>([]);
  const [guardrailComparisonError, setGuardrailComparisonError] = useState("");
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
    () => readStorage(voiceReadbackStorageKey) === "true",
  );
  const [selectedVoiceModel, setSelectedVoiceModel] = useState(
    () => readStorage(voiceModelStorageKey),
  );
  const [availableSpeechVoices, setAvailableSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedSpeechVoiceURI, setSelectedSpeechVoiceURI] = useState(
    () => readStorage(speechVoiceStorageKey),
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
  const voiceLivePeerRef = useRef<RTCPeerConnection | null>(null);
  const voiceLiveSocketRef = useRef<WebSocket | null>(null);
  const voiceLiveMediaStreamRef = useRef<MediaStream | null>(null);
  const voiceLiveAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceLiveTranscriptSequence = useRef(0);
  const [voiceLiveStatus, setVoiceLiveStatus] = useState<RealtimeStatus>("idle");
  const [voiceLiveError, setVoiceLiveError] = useState("");
  const [voiceLiveTranscript, setVoiceLiveTranscript] = useState<RealtimeTranscriptEntry[]>([]);
  const liveTranslationSocketRef = useRef<WebSocket | null>(null);
  const liveTranslationMediaStreamRef = useRef<MediaStream | null>(null);
  const liveTranslationAudioContextRef = useRef<AudioContext | null>(null);
  const liveTranslationSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const liveTranslationWorkletRef = useRef<AudioWorkletNode | null>(null);
  const liveTranslationPlayAtRef = useRef(0);
  const liveTranslationTranscriptSequence = useRef(0);
  const [liveTranslationStatus, setLiveTranslationStatus] = useState<RealtimeStatus>("idle");
  const [liveTranslationError, setLiveTranslationError] = useState("");
  const [liveTranslationTarget, setLiveTranslationTarget] = useState("en");
  const [liveTranslationTranscript, setLiveTranslationTranscript] = useState<RealtimeTranscriptEntry[]>([]);
  const traditionalMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const traditionalMediaStreamRef = useRef<MediaStream | null>(null);
  const traditionalAudioChunksRef = useRef<Blob[]>([]);
  const [traditionalVoiceStatus, setTraditionalVoiceStatus] =
    useState<TraditionalVoiceStatus>("idle");
  const [traditionalVoiceError, setTraditionalVoiceError] = useState("");
  const [traditionalVoiceResult, setTraditionalVoiceResult] =
    useState<TraditionalVoiceResult | null>(null);
  const transcriptionMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const transcriptionMediaStreamRef = useRef<MediaStream | null>(null);
  const transcriptionAudioChunksRef = useRef<Blob[]>([]);
  const transcriptionFileInputRef = useRef<HTMLInputElement | null>(null);
  const [transcriptionStatus, setTranscriptionStatus] = useState<TraditionalVoiceStatus>("idle");
  const [transcriptionError, setTranscriptionError] = useState("");
  const [transcriptionResult, setTranscriptionResult] = useState<TranscriptionResult | null>(null);
  const [transcriptionLanguage, setTranscriptionLanguage] = useState("en-US");
  const [transcriptionSourceName, setTranscriptionSourceName] = useState("");
  const [transcriptionAudioUrl, setTranscriptionAudioUrl] = useState("");
  const transcriptionAudioUrlRef = useRef("");
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = readStorage("foundry-chat-theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      return savedTheme;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [colorPalette, setColorPalette] = useState<ColorPalette>(() => {
    const savedPalette = readStorage(colorPaletteStorageKey);
    return colorPalettes.some((palette) => palette.id === savedPalette)
      ? (savedPalette as ColorPalette)
      : "foundry";
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
  const workspaceLocked = authGateActive && activeView !== "settings";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    writeStorage("foundry-chat-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.palette = colorPalette;
    writeStorage(colorPaletteStorageKey, colorPalette);
  }, [colorPalette]);

  useEffect(() => {
    setGuardrailComparisonEnabled(false);
    setActiveGuardrailPolicies([]);
    setGuardrailComparisonError("");
    setDeploymentGuardrailPolicy(null);
  }, [activeModel]);

  useEffect(() => {
    tracedFetch("/api/config", {}, { label: "Load Foundry config", responseKind: "json" })
      .then((response) => response.json())
      .then((data: ConfigResponse) => {
        const configuredModels = data.models.length ? data.models : ["gpt-4o-mini"];
        setConfig(data);
        const configuredTranscriptionModels = [
          data.speech_transcription_model,
          data.transcription_model,
          ...configuredModels.filter(isTranscriptionModelName),
        ].filter((model): model is string => Boolean(model));
        setTranscriptionModels(Array.from(new Set(configuredTranscriptionModels)));
        setTranscriptionModel(configuredTranscriptionModels[0] ?? "");
        setModels(configuredModels);
        const inferredModalities = Object.fromEntries(
          configuredModels.map((model) => [model, isImageModelName(model) ? ["image"] : ["text"]]),
        ) as Record<string, ModelModality[]>;
        setModelModalities(inferredModalities);
        setImageModel(configuredModels.find(isImageModelName) ?? "");
        setSelectedImageModels(new Set(configuredModels.filter(isImageModelName).slice(0, maxImageComparisonModelCount)));
        setActiveModel(configuredModels[0]);
        setSelectedModels(new Set(
          configuredModels
            .filter((model) => inferredModalities[model]?.includes("text"))
            .slice(0, defaultComparisonModelCount),
        ));
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
          is_speech_transcription_configured: false,
          speech_transcription_model: null,
          is_voice_live_configured: false,
          voice_live_model: null,
          voice_live_voice: null,
          is_live_interpreter_configured: false,
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
  }, [activeUseCase, canUseProtectedApis]);

  useEffect(() => {
    if (!canUseProtectedApis) {
      return;
    }

    let controller: AbortController | null = null;
    const refreshModels = () => {
      controller?.abort();
      controller = new AbortController();
      tracedFetch(
        "/api/models",
        { signal: controller.signal },
        { label: "Discover Foundry deployments", responseKind: "json" },
      )
        .then(async (response) => {
          const data = (await response.json()) as ModelsResponse;
          if (!response.ok) {
            throw new Error("Failed to discover Foundry deployments.");
          }
          if (data.models.length) {
            setModels(data.models);
            const modalities = data.model_modalities ?? Object.fromEntries(
              data.models.map((model) => [model, isImageModelName(model) ? ["image"] : ["text"]]),
            );
            setModelModalities(modalities as Record<string, ModelModality[]>);
            const imageModels = data.models.filter((model) => modalities[model]?.includes("image"));
            setImageModel((current) =>
              current && imageModels.includes(current) ? current : imageModels[0] ?? "",
            );
            setSelectedImageModels((current) => {
              const retained = imageModels.filter((model) => current.has(model));
              return new Set((retained.length ? retained : imageModels).slice(0, maxImageComparisonModelCount));
            });
            setActiveModel((current) =>
              current && data.models.includes(current) ? current : data.models[0],
            );
            setSelectedModels((current) => {
              const textModels = data.models.filter((model) => modalities[model]?.includes("text"));
              const retained = textModels.filter((model) => current.has(model));
              return new Set(
                (retained.length ? retained : textModels.slice(0, defaultComparisonModelCount))
                  .slice(0, maxComparisonModelCount),
              );
            });
          }
          if (data.transcription_models?.length) {
            setTranscriptionModels(data.transcription_models);
            setTranscriptionModel((current) =>
              current && data.transcription_models!.includes(current)
                ? current
                : data.transcription_models![0],
            );
          }
          if (data.traditional_transcription_models?.length) {
            setTraditionalTranscriptionModels(data.traditional_transcription_models);
            setTraditionalTranscriptionModel((current) =>
              current && data.traditional_transcription_models!.includes(current)
                ? current
                : data.traditional_transcription_models![0],
            );
          }
          if (data.tts_models?.length) {
            setTtsModels(data.tts_models);
            setTtsModel((current) =>
              current && data.tts_models!.includes(current) ? current : data.tts_models![0],
            );
          }
          if (data.discovery_error) {
            console.warn("Foundry deployment discovery unavailable:", data.discovery_error);
          }
        })
        .catch((error: Error) => {
          if (error.name !== "AbortError") {
            console.warn("Foundry deployment discovery failed:", error.message);
          }
        });
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refreshModels();
      }
    };

    refreshModels();
    const refreshInterval = window.setInterval(refreshModels, 30_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(refreshInterval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      controller?.abort();
    };
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
    if (config?.tts_voice) {
      setTtsVoice(config.tts_voice);
    }
  }, [config?.tts_voice]);

  useEffect(() => {
    writeStorage(voiceReadbackStorageKey, String(voiceReadbackEnabled));
    if (!voiceReadbackEnabled && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, [voiceReadbackEnabled]);

  useEffect(() => {
    if (selectedVoiceModel) {
      writeStorage(voiceModelStorageKey, selectedVoiceModel);
    } else {
      writeStorage(voiceModelStorageKey, null);
    }
  }, [selectedVoiceModel]);

  useEffect(() => {
    if (selectedSpeechVoiceURI) {
      writeStorage(speechVoiceStorageKey, selectedSpeechVoiceURI);
    } else {
      writeStorage(speechVoiceStorageKey, null);
    }
  }, [selectedSpeechVoiceURI]);

  useEffect(() => {
    const availableTextModels = models.filter((model) => modelModalities[model]?.includes("text"));
    setSelectedVoiceModel((current) =>
      current && availableTextModels.includes(current) ? current : availableTextModels[0] ?? "",
    );
  }, [modelModalities, models]);

  useEffect(
    () => () => {
      textChatRequest.cancel();
      documentRequestControllerRef.current?.abort();
      closeRealtimeConnection();
      closeTraditionalRecording();
      closeTranscriptionRecording();
      closeVoiceLiveConnection();
      closeLiveTranslationConnection();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      if (transcriptionAudioUrlRef.current) {
        URL.revokeObjectURL(transcriptionAudioUrlRef.current);
      }
    },
    [],
  );

  const selected = useMemo(
    () => models
      .filter((model) => modelModalities[model]?.includes("text") && selectedModels.has(model))
      .slice(0, maxComparisonModelCount),
    [modelModalities, models, selectedModels],
  );
  const textModels = models.filter(
    (model) => modelModalities[model]?.includes("text") && !transcriptionModels.includes(model),
  );
  const imageModels = models.filter((model) => modelModalities[model]?.includes("image"));
  const imageEditModels = imageModels.filter((model) => model.toLowerCase().includes("gpt-image"));
  const selectedImages = imageModels
    .filter((model) => selectedImageModels.has(model))
    .slice(0, maxImageComparisonModelCount);
  const activeUseCaseDetails = useMemo(
    () => useCaseModules.find((useCase) => useCase.id === activeUseCase) ?? useCaseModules[0],
    [activeUseCase],
  );

  useEffect(() => {
    if (activeUseCaseDetails.workspace === "imageEdit") {
      setImageModel((current) => current && imageEditModels.includes(current) ? current : imageEditModels[0] ?? "");
      return;
    }
    if (activeUseCaseDetails.workspace === "image" || activeUseCaseDetails.workspace === "imageComparison") {
      setImageModel((current) => current && imageModels.includes(current) ? current : imageModels[0] ?? "");
      return;
    }
    if (activeUseCaseDetails.workspace === "transcribe") {
      setTranscriptionModel((current) =>
        current && transcriptionModels.includes(current) ? current : transcriptionModels[0] ?? "",
      );
      return;
    }
    setActiveModel((current) => current && textModels.includes(current) ? current : textModels[0] ?? "");
  }, [activeUseCaseDetails.workspace, imageEditModels.join("|"), imageModels.join("|"), textModels.join("|"), transcriptionModels.join("|")]);

  function createApiTraceEntry(entry: Omit<ApiTraceEntry, "id" | "timestamp">) {
    apiTraceSequence.current += 1;
    return {
      ...entry,
      request: redactTracePayload(entry.request),
      response: redactTracePayload(entry.response),
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
      const responsePayload = options.traceResponse === false
        ? undefined
        : await readTraceResponse(response, options.responseKind);
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
    setSelectedModels((current) =>
      current.size < maxComparisonModelCount
        ? new Set([...current, deploymentName])
        : current,
    );
    setNewModel("");
    setModelEndpointMessage({
      type: "success",
      text: `Saved ${deploymentName} to the local model registry.`,
    });
  }

  function toggleModel(model: string) {
    const next = new Set(selectedModels);
    if (next.has(model)) {
      next.delete(model);
    } else if (next.size < maxComparisonModelCount) {
      next.add(model);
      if (next.size === maxComparisonModelCount) {
        toast.info("Comparison limit reached", {
          description: `You can compare up to ${maxComparisonModelCount} models at a time.`,
        });
      }
    }
    setSelectedModels(next);
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
    setActiveView("model-settings");
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

  function toggleImageComparisonModel(model: string) {
    setSelectedImageModels((current) => {
      const next = new Set(current);
      if (next.has(model)) {
        next.delete(model);
      } else if (next.size < maxImageComparisonModelCount) {
        next.add(model);
      }
      return next;
    });
  }

  function replaceImageComparisonModel(currentModel: string, nextModel: string) {
    if (currentModel === nextModel) {
      return;
    }
    setSelectedImageModels((current) => {
      const next = new Set(current);
      next.delete(currentModel);
      next.add(nextModel);
      return next;
    });
  }

  async function toggleGuardrailComparison() {
    if (guardrailComparisonEnabled) {
      setGuardrailComparisonEnabled(false);
      setGuardrailComparisonError("");
      return;
    }

    setGuardrailComparisonError("");
    try {
      const [response, deploymentPolicyResponse] = await Promise.all([
        tracedFetch(
          `/api/model-settings?model=${encodeURIComponent(activeModel)}`,
          {},
          { label: "Load guardrail comparison settings", responseKind: "json" },
        ),
        tracedFetch(
          `/api/guardrails/deployment-policy?model=${encodeURIComponent(activeModel)}`,
          {},
          { label: "Load deployment guardrail", responseKind: "json" },
        ),
      ]);
      const [settings, deploymentPolicy] = await Promise.all([
        response.json() as Promise<ModelSettings & { detail?: string }>,
        deploymentPolicyResponse.json() as Promise<DeploymentGuardrailPolicy & { detail?: string }>,
      ]);
      if (!response.ok) {
        throw new Error(settings.detail ?? "Failed to load guardrail settings.");
      }
      if (!deploymentPolicyResponse.ok) {
        throw new Error(deploymentPolicy.detail ?? "Failed to load the deployment guardrail.");
      }
      if (settings.guardrail_policy_names.length !== 2) {
        throw new Error("Configure two guardrails in model settings before enabling this test.");
      }
      setDeploymentGuardrailPolicy(deploymentPolicy);
      setActiveGuardrailPolicies(settings.guardrail_policy_names);
      setGuardrailComparisonEnabled(true);
    } catch (error) {
      setGuardrailComparisonError(
        error instanceof Error ? error.message : "Failed to enable guardrail comparison.",
      );
    }
  }

  async function refreshConversations() {
    const conversations: Conversation[] = [];
    let cursor: string | null = null;
    do {
      const query = new URLSearchParams({
        use_case: activeUseCase,
        limit: "100",
      });
      if (cursor) {
        query.set("cursor", cursor);
      }
      const response = await tracedFetch(
        `/api/conversations?${query.toString()}`,
        {},
        { label: "List conversations", responseKind: "json" },
      );
      if (!response.ok) {
        const error = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new Error(error.detail ?? "Failed to load conversations.");
      }
      const data = (await response.json()) as {
        conversations?: Conversation[];
        next_cursor?: string | null;
      };
      conversations.push(...(data.conversations ?? []));
      cursor = data.next_cursor ?? null;
    } while (cursor);
    setConversations(conversations);
  }

  async function refreshDocuments() {
    setDocumentsLoading(true);
    setDocumentMessage(null);
    try {
      const data = await listDocuments(tracedFetch);
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

    setDocumentsLoading(true);
    setDocumentMessage(null);
    try {
      const { response, body } = await uploadDocumentFiles(tracedFetch, files);
      for (const trace of body.embedding_traces ?? []) {
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
        response: body,
      });
      setDocuments(body.documents ?? []);
      setDocumentMessage({
        type: "success",
        text: `Indexed ${(body.documents ?? []).length} document${(body.documents ?? []).length === 1 ? "" : "s"} in Azure AI Search.`,
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
      await removeDocument(tracedFetch, document.id);
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
    textChatRequest.cancel();
    documentRequestControllerRef.current?.abort();
    setConversationsOpen(false);
    setActiveView("chat");
    setCurrentConversationId(null);
    setMessages([]);
    setPrompt("");
  }

  async function runImageGeneration() {
    if (!imageModel || !imagePrompt.trim() || imageGenerating) {
      return;
    }
    const [width, height] = imageSize.split("x").map(Number);
    const request = { model: imageModel, prompt: imagePrompt.trim(), width, height };
    setImageGenerating(true);
    setImageError("");
    try {
      const response = await generateImage(tracedFetch, request);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? "Image generation failed.");
      }
      setImageResult({ ...(data as Omit<ImageGenerationResult, "prompt">), prompt: request.prompt });
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Image generation failed.");
    } finally {
      setImageGenerating(false);
    }
  }

  async function runImageEdit() {
    if (!imageModel || !imagePrompt.trim() || !imageEditSource || imageEditGenerating) {
      return;
    }
    const [width, height] = imageSize.split("x").map(Number);
    setImageEditGenerating(true);
    setImageEditError("");
    try {
      const response = await editImage(tracedFetch, {
        model: imageModel,
        prompt: imagePrompt.trim(),
        width,
        height,
        image: imageEditSource,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? "Image edit failed.");
      }
      setImageEditResult({ ...(data as Omit<ImageGenerationResult, "prompt">), prompt: imagePrompt.trim() });
    } catch (error) {
      setImageEditError(error instanceof Error ? error.message : "Image edit failed.");
    } finally {
      setImageEditGenerating(false);
    }
  }

  async function runImageComparison() {
    const prompt = imagePrompt.trim();
    if (!selectedImages.length || !prompt || imageComparisonGenerating) {
      return;
    }
    const [width, height] = imageSize.split("x").map(Number);
    setImageComparisonGenerating(true);
    setImageComparisonErrors({});
    const outcomes = await Promise.all(selectedImages.map(async (model): Promise<{
      model: string;
      result?: ImageGenerationResult;
      error?: string;
    }> => {
      const request = { model, prompt, width, height };
      try {
        const response = await generateImage(tracedFetch, request);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail ?? "Image generation failed.");
        }
        return { model, result: { ...(data as Omit<ImageGenerationResult, "prompt">), prompt } };
      } catch (error) {
        return { model, error: error instanceof Error ? error.message : "Image generation failed." };
      }
    }));
    setImageComparisonResults((current) => {
      const next = { ...current };
      outcomes.forEach((outcome) => {
        if (outcome.result) {
          next[outcome.model] = outcome.result;
        }
      });
      return next;
    });
    setImageComparisonErrors(Object.fromEntries(
      outcomes.filter((outcome) => outcome.error).map((outcome) => [outcome.model, outcome.error as string]),
    ));
    setImageComparisonGenerating(false);
  }

  function selectUseCase(useCase: UseCaseId) {
    const nextUseCase = useCaseModules.find((module) => module.id === useCase) ?? useCaseModules[0];
    if ((nextUseCase.workspace === "image" || nextUseCase.workspace === "imageEdit" || nextUseCase.workspace === "imageComparison") && imageModel) {
      setActiveModel(imageModel);
    }
    if (useCase !== activeUseCase) {
      textChatRequest.cancel();
      documentRequestControllerRef.current?.abort();
      useCaseSessionRef.current += 1;
      setCurrentConversationId(null);
      setMessages([]);
      setPrompt("");
      setIsRunning(false);
    }
    setActiveUseCase(useCase);
    setActiveView("chat");
    setUseCaseMarketplaceOpen(false);
    setComparisonMode(nextUseCase.workspace === "comparison" || nextUseCase.workspace === "imageComparison");
    if (!nextUseCase.enableComposerDictation && isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }
    if (nextUseCase.workspace !== "realtimeVoice" && realtimeStatus !== "idle") {
      stopRealtimeSession();
    }
    if (nextUseCase.workspace !== "voiceLive" && voiceLiveStatus !== "idle") {
      stopVoiceLiveSession();
    }
    if (nextUseCase.workspace !== "liveTranslation" && liveTranslationStatus !== "idle") {
      stopLiveTranslationSession();
    }
    if (nextUseCase.workspace !== "traditionalVoice" && traditionalVoiceStatus === "recording") {
      stopTraditionalRecording();
    }
    if (nextUseCase.workspace !== "transcribe" && transcriptionStatus === "recording") {
      stopTranscriptionRecording();
    }
    if (useCase === "document_qa" && config?.is_document_rag_configured) {
      void refreshDocuments();
    }
  }

  async function loadConversation(conversationId: string) {
    textChatRequest.cancel();
    documentRequestControllerRef.current?.abort();
    const response = await tracedFetch(
      `/api/conversations/${conversationId}?use_case=${encodeURIComponent(activeUseCase)}`,
      {},
      { label: "Load conversation", responseKind: "json" },
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail ?? "Failed to load conversation.");
    }
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
    if (!traditionalTranscriptionModel || !ttsModel) {
      setTraditionalVoiceError("Select both an STT deployment and a TTS deployment.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setTraditionalVoiceError("This browser does not support audio recording with MediaRecorder.");
      return;
    }

    setTraditionalVoiceError("");
    setTraditionalVoiceResult(null);
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
      use_case: activeUseCase,
      reasoning_effort: reasoningEffort === "default" ? null : reasoningEffort,
      audio: {
        type: audioBlob.type || "audio/webm",
        bytes: audioBlob.size,
      },
    };
    const formData = new FormData();
    formData.append("audio", audioBlob, "foundry-voice-demo.webm");
    formData.append("model", activeModel);
    formData.append("transcription_model", traditionalTranscriptionModel);
    formData.append("tts_model", ttsModel);
    formData.append("tts_voice", ttsVoice);
    formData.append("use_case", activeUseCase);
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

      setTraditionalVoiceResult(result);
      setTraditionalVoiceStatus("complete");
      setCurrentConversationId(result.conversation.id);
      upsertConversation(result.conversation);
      setMessages((current) => [
        ...current,
        mapStoredMessage(result.user_message),
        ...result.results.map((variant) => mapStoredMessage(variant.assistant_message)),
      ]);
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

  function closeTranscriptionRecording() {
    transcriptionMediaRecorderRef.current = null;
    transcriptionMediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    transcriptionMediaStreamRef.current = null;
  }

  function replaceTranscriptionAudioUrl(url: string) {
    if (transcriptionAudioUrlRef.current) {
      URL.revokeObjectURL(transcriptionAudioUrlRef.current);
    }
    transcriptionAudioUrlRef.current = url;
    setTranscriptionAudioUrl(url);
  }

  function stopTranscriptionRecording() {
    const recorder = transcriptionMediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  async function startTranscriptionRecording() {
    if (transcriptionStatus === "recording") {
      stopTranscriptionRecording();
      return;
    }
    if (transcriptionStatus === "processing") {
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setTranscriptionError("This browser does not support audio recording with MediaRecorder.");
      return;
    }

    setTranscriptionError("");
    setTranscriptionResult(null);
    transcriptionAudioChunksRef.current = [];
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      transcriptionMediaStreamRef.current = mediaStream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
      transcriptionMediaRecorderRef.current = recorder;
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          transcriptionAudioChunksRef.current.push(event.data);
        }
      });
      recorder.addEventListener("error", () => {
        closeTranscriptionRecording();
        setTranscriptionStatus("idle");
        setTranscriptionError("Audio recording failed. Check microphone permissions and try again.");
      });
      recorder.addEventListener("stop", () => {
        const chunks = transcriptionAudioChunksRef.current;
        transcriptionAudioChunksRef.current = [];
        closeTranscriptionRecording();
        if (!chunks.length) {
          setTranscriptionStatus("idle");
          setTranscriptionError("No audio was captured.");
          return;
        }
        void runTranscription(
          new Blob(chunks, { type: recorder.mimeType || "audio/webm" }),
          "Microphone recording",
        );
      });
      recorder.start();
      setTranscriptionSourceName("Microphone recording");
      setTranscriptionStatus("recording");
    } catch (error) {
      closeTranscriptionRecording();
      setTranscriptionStatus("idle");
      setTranscriptionError(error instanceof Error ? error.message : "Failed to start recording.");
    }
  }

  async function runTranscription(source: Blob, sourceName: string) {
    setTranscriptionStatus("processing");
    setTranscriptionError("");
    setTranscriptionResult(null);
    setTranscriptionSourceName(sourceName);
    replaceTranscriptionAudioUrl(URL.createObjectURL(source));
    try {
      const wav = await convertAudioToWav(source);
      const response = await transcribeRecording(
        tracedFetch,
        wav,
        transcriptionModel,
        transcriptionLanguage,
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? "Transcription failed.");
      }
      setTranscriptionResult(data as TranscriptionResult);
      setTranscriptionStatus("complete");
    } catch (error) {
      setTranscriptionStatus("idle");
      setTranscriptionError(error instanceof Error ? error.message : "Transcription failed.");
    }
  }

  function selectTranscriptionFile(file: File | undefined) {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("audio/") && !/\.(mp3|wav|ogg|webm|m4a)$/i.test(file.name)) {
      setTranscriptionError("Select an audio file such as MP3, WAV, OGG, WebM, or M4A.");
      return;
    }
    void runTranscription(file, file.name);
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
      const tokenResponse = await createRealtimeSession(tracedFetch, requestBody);
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
      setModelModalities((current) => ({ ...current, [saved.model]: saved.modalities }));
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Failed to save settings.");
    } finally {
      setIsSavingSettings(false);
    }
  }

  function closeVoiceLiveConnection() {
    voiceLiveSocketRef.current?.close();
    voiceLiveSocketRef.current = null;
    voiceLivePeerRef.current?.getSenders().forEach((sender) => sender.track?.stop());
    voiceLivePeerRef.current?.close();
    voiceLivePeerRef.current = null;
    voiceLiveMediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceLiveMediaStreamRef.current = null;
    if (voiceLiveAudioRef.current) {
      voiceLiveAudioRef.current.pause();
      voiceLiveAudioRef.current.srcObject = null;
      voiceLiveAudioRef.current = null;
    }
  }

  function appendVoiceLiveTranscript(source: RealtimeTranscriptEntry["source"], text: string) {
    const cleaned = text.trim();
    if (!cleaned) return;
    voiceLiveTranscriptSequence.current += 1;
    setVoiceLiveTranscript((current) => [...current, {
      id: `voice-live-${voiceLiveTranscriptSequence.current}`,
      source,
      text: cleaned,
    }].slice(-8));
  }

  function handleVoiceLiveEvent(event: VoiceLiveServerEvent) {
    if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) {
      appendVoiceLiveTranscript("user", event.transcript);
    } else if ((event.type === "response.audio_transcript.done" || event.type === "response.text.done") && event.transcript) {
      appendVoiceLiveTranscript("assistant", event.transcript);
    } else if (event.type === "input_audio_buffer.speech_started") {
      appendVoiceLiveTranscript("system", "Listening - interrupt at any time");
    } else if (event.type === "error" || event.type === "rtc.call.error") {
      setVoiceLiveError(event.error?.message ?? "Voice Live reported an error.");
    }
  }

  function stopVoiceLiveSession() {
    closeVoiceLiveConnection();
    setVoiceLiveStatus("idle");
    appendVoiceLiveTranscript("system", "Voice Live session stopped");
  }

  async function startVoiceLiveSession() {
    if (voiceLiveStatus !== "idle") {
      stopVoiceLiveSession();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection || !window.WebSocket) {
      setVoiceLiveError("This browser does not support the WebRTC APIs required for Voice Live.");
      return;
    }

    setVoiceLiveStatus("connecting");
    setVoiceLiveError("");
    setVoiceLiveTranscript([]);
    try {
      const peerConnection = new RTCPeerConnection();
      voiceLivePeerRef.current = peerConnection;
      const audioElement = new Audio();
      audioElement.autoplay = true;
      voiceLiveAudioRef.current = audioElement;
      peerConnection.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream && voiceLiveAudioRef.current) {
          voiceLiveAudioRef.current.srcObject = remoteStream;
          void voiceLiveAudioRef.current.play();
        }
      };
      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === "connected") setVoiceLiveStatus("live");
        if (peerConnection.connectionState === "failed") {
          setVoiceLiveError("Voice Live WebRTC connection failed.");
          stopVoiceLiveSession();
        }
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      voiceLiveMediaStreamRef.current = mediaStream;
      mediaStream.getTracks().forEach((track) => peerConnection.addTrack(track, mediaStream));
      const dataChannel = peerConnection.createDataChannel("voice-live-events");
      dataChannel.addEventListener("message", (message) => {
        try { handleVoiceLiveEvent(JSON.parse(message.data) as VoiceLiveServerEvent); } catch { /* Ignore non-JSON events. */ }
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await new Promise<void>((resolve) => {
        if (peerConnection.iceGatheringState === "complete") return resolve();
        const listener = () => {
          if (peerConnection.iceGatheringState === "complete") {
            peerConnection.removeEventListener("icegatheringstatechange", listener);
            resolve();
          }
        };
        peerConnection.addEventListener("icegatheringstatechange", listener);
      });
      if (!peerConnection.localDescription?.sdp) throw new Error("Browser did not create a Voice Live SDP offer.");

      const socket = new WebSocket(voiceLiveUrl(), "realtime");
      voiceLiveSocketRef.current = socket;
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener("open", () => resolve(), { once: true });
        socket.addEventListener("error", () => reject(new Error("Voice Live control channel failed.")), { once: true });
      });

      const answer = new Promise<string>((resolve, reject) => {
        socket.addEventListener("message", (message) => {
          const event = JSON.parse(message.data) as VoiceLiveServerEvent;
          handleVoiceLiveEvent(event);
          if (event.type === "rtc.call.sdp.created" && event.sdp_answer) resolve(event.sdp_answer);
          if (event.type === "error" || event.type === "rtc.call.error") reject(new Error(event.error?.message ?? "Voice Live call setup failed."));
        });
      });
      socket.send(JSON.stringify({
        type: "rtc.call.sdp.create",
        sdp_offer: peerConnection.localDescription.sdp,
        session: {
          modalities: ["text", "audio"],
          instructions: "You are Ava, a multilingual travel concierge. Help travelers plan practical trips through natural spoken conversation. Ask one focused question at a time about destination, dates, budget, interests, and accessibility needs. Reply in the language used by the traveler. Never claim that a booking is confirmed; clearly label suggestions and summarize the proposed itinerary before ending.",
          voice: { type: "azure-standard", name: config?.voice_live_voice ?? "en-US-Ava:DragonHDLatestNeural", temperature: 0.8 },
          turn_detection: { type: "azure_semantic_vad_multilingual", remove_filler_words: true, interrupt_response: true, create_response: true },
          input_audio_noise_reduction: { type: "azure_deep_noise_suppression" },
          input_audio_echo_cancellation: { type: "server_echo_cancellation" },
        },
      }));
      await peerConnection.setRemoteDescription({ type: "answer", sdp: await answer });
      appendVoiceLiveTranscript("system", `Connected to Voice Live (${config?.voice_live_model ?? "gpt-realtime"})`);
    } catch (error) {
      closeVoiceLiveConnection();
      setVoiceLiveStatus("idle");
      setVoiceLiveError(error instanceof Error ? error.message : "Failed to start Voice Live.");
    }
  }

  function appendLiveTranslation(text: string, detectedLanguage?: string | null) {
    const cleaned = text.trim();
    if (!cleaned) return;
    liveTranslationTranscriptSequence.current += 1;
    setLiveTranslationTranscript((current) => [...current, {
      id: `live-translation-${liveTranslationTranscriptSequence.current}`,
      source: "assistant" as const,
      text: detectedLanguage ? `${cleaned} · detected ${detectedLanguage}` : cleaned,
    }].slice(-10));
  }

  function playLiveTranslationPcm(data: ArrayBuffer) {
    const context = liveTranslationAudioContextRef.current;
    if (!context) return;
    const pcm = new Int16Array(data);
    const buffer = context.createBuffer(1, pcm.length, 16000);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < pcm.length; index += 1) channel[index] = pcm[index] / 0x8000;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime, liveTranslationPlayAtRef.current);
    source.start(startAt);
    liveTranslationPlayAtRef.current = startAt + buffer.duration;
  }

  function closeLiveTranslationConnection() {
    const socket = liveTranslationSocketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "stop" }));
    socket?.close();
    liveTranslationSocketRef.current = null;
    liveTranslationWorkletRef.current?.disconnect();
    liveTranslationWorkletRef.current = null;
    liveTranslationSourceRef.current?.disconnect();
    liveTranslationSourceRef.current = null;
    liveTranslationMediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    liveTranslationMediaStreamRef.current = null;
    void liveTranslationAudioContextRef.current?.close();
    liveTranslationAudioContextRef.current = null;
    liveTranslationPlayAtRef.current = 0;
  }

  function stopLiveTranslationSession() {
    closeLiveTranslationConnection();
    setLiveTranslationStatus("idle");
  }

  async function startLiveTranslationSession() {
    if (liveTranslationStatus !== "idle") {
      stopLiveTranslationSession();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode || !window.WebSocket) {
      setLiveTranslationError("This browser does not support the audio APIs required for Live Interpreter.");
      return;
    }

    setLiveTranslationStatus("connecting");
    setLiveTranslationError("");
    setLiveTranslationTranscript([]);
    try {
      const AudioContextClass = window.AudioContext;
      const context = new AudioContextClass();
      liveTranslationAudioContextRef.current = context;
      await context.audioWorklet.addModule(new URL("../live-interpreter-worklet.js", import.meta.url));
      await context.resume();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      liveTranslationMediaStreamRef.current = stream;
      const source = context.createMediaStreamSource(stream);
      liveTranslationSourceRef.current = source;
      const worklet = new AudioWorkletNode(context, "live-interpreter-processor");
      liveTranslationWorkletRef.current = worklet;

      const socket = new WebSocket(liveInterpreterUrl());
      socket.binaryType = "arraybuffer";
      liveTranslationSocketRef.current = socket;
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener("open", () => resolve(), { once: true });
        socket.addEventListener("error", () => reject(new Error("Live Interpreter connection failed.")), { once: true });
      });

      const ready = new Promise<void>((resolve, reject) => {
        socket.addEventListener("close", () => reject(new Error("Live Interpreter closed before it was ready.")), { once: true });
        socket.addEventListener("message", (message) => {
          if (message.data instanceof ArrayBuffer) {
            playLiveTranslationPcm(message.data);
            return;
          }
          const event = JSON.parse(message.data) as LiveInterpreterServerEvent;
          if (event.type === "ready") resolve();
          if (event.type === "translation" && event.text) appendLiveTranslation(event.text, event.detected_language);
          if (event.type === "error") {
            const error = event.error ?? "Live Interpreter reported an error.";
            setLiveTranslationError(error);
            closeLiveTranslationConnection();
            setLiveTranslationStatus("idle");
            reject(new Error(error));
          }
        });
      });
      socket.send(JSON.stringify({ type: "start", target_language: liveTranslationTarget }));
      await ready;
      worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(event.data);
      };
      source.connect(worklet);
      const silentOutput = context.createGain();
      silentOutput.gain.value = 0;
      worklet.connect(silentOutput).connect(context.destination);
      setLiveTranslationStatus("live");
    } catch (error) {
      closeLiveTranslationConnection();
      setLiveTranslationStatus("idle");
      setLiveTranslationError(error instanceof Error ? error.message : "Failed to start Live Interpreter.");
    }
  }

  async function saveModelCapabilities(model: string, modalities: ModelModality[]) {
    const settingsResponse = await tracedFetch(
      `/api/model-settings?model=${encodeURIComponent(model)}`,
      {},
      { label: "Load model capabilities", responseKind: "json" },
    );
    const settings = await settingsResponse.json();
    if (!settingsResponse.ok) {
      throw new Error(settings.detail ?? "Failed to load model capabilities.");
    }
    const request = { ...settings, modalities };
    const response = await tracedFetch(
      "/api/model-settings",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      },
      { label: "Save model capabilities", request, responseKind: "json" },
    );
    const saved = await response.json();
    if (!response.ok) {
      throw new Error(saved.detail ?? "Failed to save model capabilities.");
    }
    setModelModalities((current) => ({ ...current, [model]: saved.modalities }));
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
      setSelectedModels((current) =>
        current.size < maxComparisonModelCount
          ? new Set([...current, deploymentName])
          : current,
      );
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
    const useCaseSession = useCaseSessionRef.current;
    const pendingUser = createUserMessage(userPrompt);
    const pendingAssistant = createAssistantMessage({
      model: activeModel,
      content: guardrailComparisonEnabled ? "Running guardrail 1..." : "",
      pending: true,
      guardrail_variant: guardrailComparisonEnabled ? "policy_1" : null,
    });
    const pendingPolicy2 = createAssistantMessage({
      model: activeModel,
      content: "Running guardrail 2...",
      guardrail_variant: "policy_2",
      pending: true,
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
        guardrail_comparison: guardrailComparisonEnabled,
        use_case: activeUseCase,
      };
      const { response, events: apiEvents } = await textChatRequest.stream({
        request: requestBody,
        fetchClient: tracedFetch,
        onEvent: (event) => {
        if (useCaseSession !== useCaseSessionRef.current) {
          return;
        }
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
                  guardrail_variant: event.guardrail_comparison ? ("policy_1" as const) : null,
                  guardrail_policy_name:
                    event.guardrail_policy_names?.[0] === deploymentDefaultGuardrail
                      ? null
                      : event.guardrail_policy_names?.[0],
                };
              }
              return message;
            });
            return event.guardrail_comparison
              ? [
                  ...updated,
                  {
                    ...pendingPolicy2,
                    api_surface: event.api_surface,
                    guardrail_policy_name:
                      event.guardrail_policy_names?.[1] === deploymentDefaultGuardrail
                        ? null
                        : event.guardrail_policy_names?.[1],
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
            event.result.guardrail_variant === "policy_2" ||
            event.result.guardrail_variant === "guarded"
              ? pendingPolicy2.id
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
                    pending: false,
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
        },
      });
      appendApiResponseTrace({
        label: "Stream chat response",
        method: "SSE",
        url: "/api/chat/stream",
        status: response.status,
        response: { events: apiEvents },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      replacePendingMessages(guardrailComparisonEnabled ? 3 : 2, [
        createUserMessage(userPrompt),
        createAssistantMessage({
          model: activeModel,
          error: error instanceof Error ? error.message : "Chat request failed.",
        }),
      ]);
    } finally {
      if (useCaseSession === useCaseSessionRef.current) {
        setIsRunning(false);
      }
    }
  }

  async function runDocumentChat() {
    if (!prompt.trim() || !activeModel || !documents.length) {
      return;
    }

    const userPrompt = prompt.trim();
    const useCaseSession = useCaseSessionRef.current;
    const pendingUser = createUserMessage(userPrompt);
    const pendingAssistant = createAssistantMessage({ model: activeModel, content: "Retrieving documents..." });
    const pendingPolicy2 = createAssistantMessage({
      model: activeModel,
      content: "Running guardrail 2 against retrieved context...",
      guardrail_variant: "policy_2",
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
        guardrail_comparison: guardrailComparisonEnabled,
        use_case: activeUseCase,
      };
      documentRequestControllerRef.current?.abort();
      const controller = new AbortController();
      documentRequestControllerRef.current = controller;
      const { response, events: apiEvents } = await streamDocumentAnswer({
        fetchClient: tracedFetch,
        request: requestBody,
        signal: controller.signal,
        onEvent: (event) => {
        if (useCaseSession !== useCaseSessionRef.current) {
          return;
        }
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
                  guardrail_variant: event.guardrail_comparison ? ("policy_1" as const) : null,
                  guardrail_policy_name:
                    event.guardrail_policy_names?.[0] === deploymentDefaultGuardrail
                      ? null
                      : event.guardrail_policy_names?.[0],
                };
              }
              return message;
            });
            return event.guardrail_comparison
              ? [
                  ...updated,
                  {
                    ...pendingPolicy2,
                    api_surface: event.api_surface,
                    guardrail_policy_name:
                      event.guardrail_policy_names?.[1] === deploymentDefaultGuardrail
                        ? null
                        : event.guardrail_policy_names?.[1],
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
            event.result.guardrail_variant === "policy_2" ||
            event.result.guardrail_variant === "guarded"
              ? pendingPolicy2.id
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
        },
      });
      appendApiResponseTrace({
        label: "Document RAG stream response",
        method: "SSE",
        url: "/api/documents/ask/stream",
        status: response.status,
        response: { events: apiEvents },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      replacePendingMessages(guardrailComparisonEnabled ? 3 : 2, [
        createUserMessage(userPrompt),
        createAssistantMessage({
          model: activeModel,
          error: error instanceof Error ? error.message : "Document question failed.",
        }),
      ]);
    } finally {
      documentRequestControllerRef.current = null;
      if (useCaseSession === useCaseSessionRef.current) {
        setIsRunning(false);
      }
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
      ...selected.map((model) => createAssistantMessage({ model, pending: true })),
    ]);

    try {
      const requestBody = {
        models: selected,
        prompt: userPrompt,
        conversation_id: currentConversationId,
        reasoning_effort: reasoningEffort === "default" ? null : reasoningEffort,
        use_case: activeUseCase,
      };
      const response = await compareModels(tracedFetch, requestBody);
      const data = await response.json();

      if (useCaseSession !== useCaseSessionRef.current) {
        return;
      }

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
        assistantMessages.filter(
          (message: StoredMessage) =>
            message.guardrail_variant !== "guarded" && message.guardrail_variant !== "policy_2",
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
  const loginUrl = "/api/auth/login";
  const logoutUrl = "/api/auth/logout";

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
                "palette-selected",
            )}
            title="Open the use-case marketplace"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Use cases
            <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-[#303033] dark:text-slate-200">
              {activeUseCaseDetails.shortTitle}
            </span>
            {realtimeStatus !== "idle" || traditionalVoiceStatus === "recording" || transcriptionStatus === "recording" ? (
              <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] text-white">
                {realtimeStatus !== "idle" ? "Live" : "Recording"}
              </span>
            ) : null}
          </button>
        </div>
        <div className="ml-auto flex items-center gap-3 text-slate-400 dark:text-slate-500">
          <button
            type="button"
            onClick={() => {
              setApiTraceOpen(false);
              setActiveView("settings");
            }}
            className={cn(
              "rounded-full border border-slate-200 bg-slate-100 p-1.5 text-slate-500 transition hover:bg-slate-200 dark:border-[#606066] dark:bg-[#45454a] dark:text-slate-300 dark:hover:bg-[#505056]",
              activeView === "settings" && "border-primary text-primary ring-1 ring-primary",
            )}
            title="Open app settings"
            aria-label="Open app settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
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
                  onClick={() => {
                    accountMenuRef.current?.removeAttribute("open");
                    setApiTraceOpen(false);
                    setActiveView("settings");
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-[#45454a]"
                >
                  <Settings className="h-4 w-4" />
                  App settings
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
                {entraAuthEnabled ? "Sign in with Microsoft" : "Sign-in unavailable locally"}
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
                <div
                  key={conversation.id}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setConversationMenu({
                      conversation,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                  className={cn(
                    "group flex items-center rounded-md text-sm transition hover:bg-slate-100 dark:hover:bg-[#45454a]",
                    currentConversationId === conversation.id &&
                      "bg-slate-100 font-medium dark:bg-[#45454a]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => void loadConversation(conversation.id)}
                    className="min-w-0 flex-1 truncate px-2 py-2 text-left"
                    title={conversation.title}
                  >
                    {conversation.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteConversationById(conversation)}
                    className="mr-1 rounded p-1 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-red-950/30 dark:hover:text-red-300"
                    aria-label={`Delete ${conversation.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
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
          !workspaceLocked && "lg:grid-cols-[18rem_minmax(0,1fr)]",
        )}
      >
        {!workspaceLocked ? (
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-white p-4 shadow-sm dark:border-[#55555a] dark:bg-[#39393d]">
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
          {activeUseCaseDetails.workspace === "traditionalVoice" ? (
            <div className="grid gap-4">
              <SidebarPipelineSelect label="STT model" value={traditionalTranscriptionModel} models={traditionalTranscriptionModels} onChange={setTraditionalTranscriptionModel} disabled={traditionalVoiceStatus === "recording" || traditionalVoiceStatus === "processing"} />
              <div className="grid gap-2">
                <Label htmlFor="traditional-chat-model" className="palette-heading">Chat model</Label>
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <Select value={activeModel} onValueChange={setActiveModel} disabled={traditionalVoiceStatus === "recording" || traditionalVoiceStatus === "processing"}>
                      <SelectTrigger id="traditional-chat-model" className="h-9 w-full dark:border-[#606066] dark:bg-[#29292c]"><SelectValue placeholder="Select chat model" /></SelectTrigger>
                      <SelectContent position="popper" align="start">
                        {textModels.map((model) => <SelectItem key={model} value={model}>{formatModelName(model)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="button" variant="outline" size="icon" disabled={!canUseProtectedApis || !activeModel} onClick={() => void openSettings(activeModel)} title="Open chat model settings" className="shrink-0">
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <SidebarPipelineSelect label="TTS model" value={ttsModel} models={ttsModels} onChange={setTtsModel} disabled={traditionalVoiceStatus === "recording" || traditionalVoiceStatus === "processing"} />
              <SidebarPipelineSelect label="TTS voice" value={ttsVoice} models={traditionalTtsVoices} onChange={setTtsVoice} disabled={traditionalVoiceStatus === "recording" || traditionalVoiceStatus === "processing"} />
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="active-model" className="palette-heading">Model</Label>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <Select
                    value={activeUseCaseDetails.workspace === "transcribe" ? transcriptionModel : activeUseCaseDetails.workspace === "image" || activeUseCaseDetails.workspace === "imageEdit" || activeUseCaseDetails.workspace === "imageComparison" ? imageModel : activeModel}
                    onValueChange={(model) => {
                      if (activeUseCaseDetails.workspace === "transcribe") {
                        setTranscriptionModel(model);
                      } else if (activeUseCaseDetails.workspace === "image" || activeUseCaseDetails.workspace === "imageEdit" || activeUseCaseDetails.workspace === "imageComparison") {
                        setImageModel(model);
                        setActiveModel(model);
                      } else {
                        setActiveModel(model);
                      }
                    }}
                  >
                    <SelectTrigger id="active-model" className="h-9 w-full dark:border-[#606066] dark:bg-[#29292c]"><SelectValue /></SelectTrigger>
                    <SelectContent position="popper" align="start">
                      {(activeUseCaseDetails.workspace === "transcribe" ? transcriptionModels : activeUseCaseDetails.workspace === "imageEdit" ? imageEditModels : activeUseCaseDetails.workspace === "image" || activeUseCaseDetails.workspace === "imageComparison" ? imageModels : textModels).map((model) => <SelectItem key={model} value={model}>{formatModelName(model)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="outline" size="icon" disabled={!canUseProtectedApis} onClick={() => void openSettings(activeUseCaseDetails.workspace === "transcribe" ? transcriptionModel : activeUseCaseDetails.workspace === "image" || activeUseCaseDetails.workspace === "imageEdit" || activeUseCaseDetails.workspace === "imageComparison" ? imageModel : activeModel)} title="Open model settings" className="shrink-0">
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
                      role={documentMessage.type === "error" ? "alert" : "status"}
                      aria-live="polite"
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
                    {textModels.map((model) => (
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
                  <p role="alert" className="text-xs text-amber-600 dark:text-amber-300">{voiceError}</p>
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
                {textModels.map((model) => (
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
                      className="min-w-0 flex-1 truncate text-left disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => toggleModel(model)}
                      disabled={!selectedModels.has(model) && selectedModels.size >= maxComparisonModelCount}
                      title={
                        !selectedModels.has(model) && selectedModels.size >= maxComparisonModelCount
                          ? `You can compare up to ${maxComparisonModelCount} models.`
                          : undefined
                      }
                    >
                      {formatModelName(model)}
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

          {activeUseCaseDetails.showImageComparisonControls ? (
          <div className="mt-4 border-t pt-4 dark:border-[#55555a]">
            <SidebarSection title="Image comparison">
              <div className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-left dark:border-violet-500/60 dark:bg-violet-500/15">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <GitCompareArrows className="h-4 w-4 text-violet-600" />
                  <span className="truncate">Side-by-side images</span>
                </span>
                <Badge variant="default" className="shrink-0">On</Badge>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {imageModels.map((model) => (
                  <div
                    key={model}
                    className={cn(
                      "flex items-center justify-between rounded-md border px-2 py-1.5 text-sm",
                      selectedImageModels.has(model)
                        ? "border-blue-300 bg-blue-50 dark:border-violet-500/60 dark:bg-violet-500/15"
                        : "border-slate-200 bg-white dark:border-[#606066] dark:bg-[#29292c]",
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => toggleImageComparisonModel(model)}
                      disabled={!selectedImageModels.has(model) && selectedImageModels.size >= maxImageComparisonModelCount}
                      title={!selectedImageModels.has(model) && selectedImageModels.size >= maxImageComparisonModelCount ? "You can compare up to two image models." : undefined}
                    >
                      {formatModelName(model)}
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

          {activeView === "chat" && activeUseCaseDetails.workspace === "chat" ? (
            <div className="mt-4 border-t pt-4 dark:border-[#55555a]">
              <SidebarSection title="Guardrail test">
                <button
                  type="button"
                  onClick={() => void toggleGuardrailComparison()}
                  disabled={!activeModel || isRunning}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
                    guardrailComparisonEnabled
                      ? "border-slate-400 bg-slate-100 dark:border-[#77777d] dark:bg-[#505056]"
                      : "border-slate-200 bg-white hover:bg-slate-50 dark:border-[#606066] dark:bg-[#29292c] dark:hover:bg-[#45454a]",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <GitCompareArrows className="h-4 w-4 shrink-0" />
                    <span className="truncate">Side-by-side guardrails</span>
                  </span>
                  <Badge variant="outline" className="shrink-0">
                    {guardrailComparisonEnabled ? "On" : "Off"}
                  </Badge>
                </button>
                {guardrailComparisonEnabled ? (
                  <div className="mt-2 grid gap-1 text-xs text-slate-500 dark:text-slate-400">
                    {activeGuardrailPolicies.map((policy, index) => (
                      <div key={`${policy}-${index}`} className="truncate">
                        Guardrail {index + 1}:{" "}
                        {formatConfiguredGuardrail(
                          policy,
                          deploymentGuardrailPolicy?.policy_name,
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
                {guardrailComparisonError ? (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                    {guardrailComparisonError}
                  </p>
                ) : null}
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
                      ? `Configure ${settingsModel ?? activeModel}`
                        : activeUseCaseDetails.workspace === "image"
                          ? `Create a PNG with ${imageModel || "an image deployment"}`
                        : activeUseCaseDetails.workspace === "imageEdit"
                          ? `Transform a source image with ${imageModel || "a compatible image deployment"}`
                       : activeUseCaseDetails.workspace === "imageComparison"
                         ? `Comparing ${selectedImages.length} image endpoint${selectedImages.length === 1 ? "" : "s"}`
                      : activeUseCaseDetails.workspace === "comparison"
                      ? `Comparing ${selected.length} model endpoint${selected.length === 1 ? "" : "s"}`
                      : activeUseCase === "document_qa"
                        ? `${documents.length} indexed document${documents.length === 1 ? "" : "s"} - active model: ${formatModelName(activeModel)}`
                      : activeUseCaseDetails.workspace === "traditionalVoice" ||
                          activeUseCaseDetails.workspace === "transcribe" ||
                          activeUseCaseDetails.workspace === "realtimeVoice" ||
                          activeUseCaseDetails.workspace === "voiceLive" ||
                          activeUseCaseDetails.workspace === "liveTranslation"
                        ? activeUseCaseDetails.description
                        : `${currentConversationId
                            ? conversations.find((item) => item.id === currentConversationId)?.title ?? "Saved chat"
                            : "New unsaved chat"} - active model: ${formatModelName(activeModel)}`}
              </p>
            </div>
            <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
              {activeView !== "model-settings" ? (
                <button
                  type="button"
                  onClick={() => void openSettings(activeUseCaseDetails.workspace === "transcribe" ? transcriptionModel : activeUseCaseDetails.workspace === "image" || activeUseCaseDetails.workspace === "imageEdit" || activeUseCaseDetails.workspace === "imageComparison" ? imageModel : activeModel)}
                  className="rounded p-1 hover:bg-slate-100 dark:hover:bg-[#45454a]"
                  aria-label="Open active model settings"
                >
                  <Settings className="h-4 w-4" />
                </button>
              ) : null}
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

          {workspaceLocked ? (
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
            <AppSettingsPage
              models={models}
              modelModalities={modelModalities}
              newModel={newModel}
              message={modelEndpointMessage}
              colorPalette={colorPalette}
              canManageModels={canUseProtectedApis}
              onNewModelChange={setNewModel}
              onAddModel={() => void addModel()}
              onOpenAdmin={() => void openAdmin()}
              onSaveCapabilities={saveModelCapabilities}
              onColorPaletteChange={setColorPalette}
            />
          ) : activeView === "model-settings" && settingsModel ? (
            <ModelSettingsPage
              model={settingsModel}
              draft={settingsDraft}
              saving={isSavingSettings}
              policies={guardrailPolicies}
              deploymentPolicy={deploymentGuardrailPolicy}
              policiesLoading={guardrailPoliciesLoading}
              error={settingsError}
              onClose={() => {
                setSettingsModel(null);
                setActiveView("chat");
              }}
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
          ) : activeUseCaseDetails.workspace === "image" ? (
            <TextToImageWorkspace
              model={imageModel}
              models={imageModels}
              prompt={imagePrompt}
              size={imageSize}
              result={imageResult}
              generating={imageGenerating}
              error={imageError}
              onPromptChange={setImagePrompt}
              onSizeChange={setImageSize}
              onModelChange={(model) => {
                setImageModel(model);
                setActiveModel(model);
              }}
              onGenerate={() => void runImageGeneration()}
            />
          ) : activeUseCaseDetails.workspace === "imageEdit" ? (
            <ImageToImageWorkspace
              model={imageModel}
              models={imageEditModels}
              prompt={imagePrompt}
              size={imageSize}
              source={imageEditSource}
              result={imageEditResult}
              generating={imageEditGenerating}
              error={imageEditError}
              onPromptChange={setImagePrompt}
              onSizeChange={setImageSize}
              onSourceChange={(source) => {
                setImageEditSource(source);
                setImageEditResult(null);
                setImageEditError("");
              }}
              onModelChange={(model) => {
                setImageModel(model);
                setActiveModel(model);
              }}
              onGenerate={() => void runImageEdit()}
            />
          ) : activeUseCaseDetails.workspace === "imageComparison" ? (
            <ImageComparisonWorkspace
              allModels={imageModels}
              models={selectedImages}
              prompt={imagePrompt}
              size={imageSize}
              results={imageComparisonResults}
              errors={imageComparisonErrors}
              generating={imageComparisonGenerating}
              onPromptChange={setImagePrompt}
              onSizeChange={setImageSize}
              onGenerate={() => void runImageComparison()}
              onOpenSettings={(model) => void openSettings(model)}
              onModelChange={replaceImageComparisonModel}
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
              onOpenSettings={(model) => void openSettings(model)}
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
              onStart={() => void startTraditionalRecording()}
              onStop={stopTraditionalRecording}
            />
          ) : activeUseCaseDetails.workspace === "transcribe" ? (
            <TranscriptionWorkspace
              configured={transcriptionModel.toLowerCase().startsWith("mai-transcribe")
                ? config?.is_speech_transcription_configured ?? false
                : config?.is_configured ?? false}
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
              onFileSelected={selectTranscriptionFile}
            />
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
          ) : activeUseCaseDetails.workspace === "voiceLive" ? (
            <div className="flex-1 overflow-auto p-5">
              <div className="mx-auto flex min-h-full max-w-4xl items-center justify-center">
                <VoiceLiveHero
                  configured={config?.is_voice_live_configured ?? false}
                  model={config?.voice_live_model ?? "gpt-realtime"}
                  voice={config?.voice_live_voice ?? "en-US-Ava:DragonHDLatestNeural"}
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
          ) : guardrailComparisonEnabled && activeUseCaseDetails.workspace === "chat" ? (
            <GuardrailComparisonWorkspace
              model={activeModel}
              policyNames={activeGuardrailPolicies}
              deploymentPolicyName={deploymentGuardrailPolicy?.policy_name}
              messages={messages}
              prompt={prompt}
              isRunning={isRunning}
              canSubmit={canSubmit}
              onPromptChange={setPrompt}
              onSubmit={() =>
                activeUseCase === "document_qa" ? void runDocumentChat() : void runChat()
              }
              onOpenSettings={() => void openSettings(activeModel)}
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
                        onClick={() => void openSettings(activeModel)}
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
                          <InfinityIcon className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
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
                      <ComposerSelect
                        id="composer-reasoning"
                        ariaLabel="Reasoning level"
                        value={reasoningEffort}
                        onChange={(value) => setReasoningEffort(value as ReasoningEffort)}
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
      <Toaster theme={theme} position="bottom-right" richColors closeButton />
    </main>
  );
}
