export type UseCaseId =
  | "text_chat"
  | "azure_architect_agent"
  | "hosted_agent"
  | "retail_agent"
  | "investment_planner_prompt"
  | "document_qa"
  | "content_extractor"
  | "comparison"
  | "reasoning_comparison"
  | "browser_voice"
  | "traditional_voice"
  | "language_learning"
  | "azure_speech_tts"
  | "text_to_speech_avatar"
  | "foundry_gpt_audio"
  | "transcribe"
  | "transcription_comparison"
  | "realtime_voice"
  | "realtime_transcription_webrtc"
  | "realtime_transcription_websocket"
  | "realtime_translation_webrtc"
  | "realtime_translation_websocket"
  | "voice_live"
  | "live_chat_avatar"
  | "live_translation"
  | "text_translation"
  | "language_detection"
  | "pii_redaction"
  | "text_analytics_health"
  | "text_to_image"
  | "image_to_image"
  | "image_comparison"
  | "youtube_summary"
  | "youtube_realtime_transcription"
  | "captioning"
  | "dubbing"
  | "video_translation";

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
  | "azureArchitectAgent"
  | "hostedAgent"
  | "retailAgent"
  | "investmentPlannerPrompt"
  | "contentExtractor"
  | "comparison"
  | "image"
  | "imageEdit"
  | "imageComparison"
  | "traditionalVoice"
  | "azureSpeechTts"
  | "textToSpeechAvatar"
  | "foundryGptAudio"
  | "realtimeVoice"
  | "realtimeTranscriptionWebRtc"
  | "realtimeTranscriptionWebSocket"
  | "realtimeTranslationWebRtc"
  | "realtimeTranslationWebSocket"
  | "voiceLive"
  | "liveChatAvatar"
  | "liveTranslation"
  | "textTranslation"
  | "transcribe"
  | "transcriptionComparison"
  | "youtubeSummary"
  | "youtubeRealtimeTranscription"
  | "captioning"
  | "dubbing"
  | "videoTranslation";
export type UseCaseModality = "text" | "image" | "audio" | "video";
export type WorkspaceRenderer = "chat" | "agent" | "voice" | "image";
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
  showLabels?: boolean;
  icon: UseCaseIconName;
  modalities: UseCaseModality[];
  implementation: string[];
  documentation?: {
    title: string;
    url: string;
    description?: string;
  }[];
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
