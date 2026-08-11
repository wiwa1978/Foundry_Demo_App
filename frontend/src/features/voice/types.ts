export type RealtimeStatus = "idle" | "connecting" | "live" | "stopping";
export type RealtimeTranscriptionTransport = "webrtc" | "websocket";
export type RealtimeTranscriptionDelay =
  "default" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type RealtimeTranscriptionTurnDetection =
  "none" | "server_vad" | "semantic_vad";
export type LiveTranslationMode = "standard" | "personal";

export type TraditionalVoiceStatus =
  "idle" | "recording" | "processing" | "complete";

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

export type BrowserSpeechRecognitionConstructor =
  new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

export type RealtimeServerEvent = {
  type?: string;
  transcript?: string;
  delta?: string;
  item_id?: string;
  model?: string;
  sequence?: number;
  error?: {
    message?: string;
  };
};

export type RealtimeTranscriptEntry = {
  id: string;
  source: "user" | "assistant" | "system";
  text: string;
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

export type RealtimeTranslationServerEvent = {
  type: string;
  delta?: string;
  transcript?: string;
  translation?: string;
  model?: string;
  transcription_model?: string;
  sample_rate?: number;
  channels?: number;
  format?: string;
  error?: { message?: string };
};
