export type UseCaseId =
  | "text_chat"
  | "agent_research"
  | "hosted_agent"
  | "document_qa"
  | "comparison"
  | "browser_voice"
  | "traditional_voice"
  | "transcribe"
  | "transcription_comparison"
  | "realtime_voice"
  | "realtime_transcription_webrtc"
  | "realtime_transcription_websocket"
  | "realtime_translation_websocket"
  | "voice_live"
  | "live_translation"
  | "text_to_image"
  | "image_to_image"
  | "image_comparison"
  | "youtube_summary";

export type UseCaseIconName =
  | "chat"
  | "comparison"
  | "browserVoice"
  | "documents"
  | "image"
  | "video"
  | "voiceWave";
export type UseCaseWorkspace =
  | "chat"
  | "agentResearch"
  | "hostedAgent"
  | "comparison"
  | "image"
  | "imageEdit"
  | "imageComparison"
  | "traditionalVoice"
  | "realtimeVoice"
  | "realtimeTranscriptionWebRtc"
  | "realtimeTranscriptionWebSocket"
  | "realtimeTranslationWebSocket"
  | "voiceLive"
  | "liveTranslation"
  | "transcribe"
  | "transcriptionComparison"
  | "youtubeSummary";
export type UseCaseModality = "text" | "image" | "audio" | "video";
export type UseCaseCategory = "media" | "agents";

export type UseCaseModule = {
  id: UseCaseId;
  category?: UseCaseCategory;
  title: string;
  typeLabel?: string;
  frameworkLabel?: string;
  shortTitle: string;
  description: string;
  badge: string;
  icon: UseCaseIconName;
  modalities: UseCaseModality[];
  implementation: string[];
  codeSnippet: {
    title: string;
    language: string;
    code: string;
  };
  workspace: UseCaseWorkspace;
  showBrowserVoiceControls?: boolean;
  showComparisonControls?: boolean;
  showImageComparisonControls?: boolean;
  showTranscriptionComparisonControls?: boolean;
  showDocumentControls?: boolean;
  showChatComposer?: boolean;
  enableComposerDictation?: boolean;
};
