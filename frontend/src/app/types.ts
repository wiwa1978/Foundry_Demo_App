export type UseCaseId =
  | "text_chat"
  | "document_qa"
  | "comparison"
  | "browser_voice"
  | "traditional_voice"
  | "transcribe"
  | "transcription_comparison"
  | "realtime_voice"
  | "voice_live"
  | "live_translation"
  | "text_to_image"
  | "image_to_image"
  | "image_comparison";

export type UseCaseIconName =
  "chat" | "comparison" | "browserVoice" | "documents" | "image" | "voiceWave";
export type UseCaseWorkspace =
  | "chat"
  | "comparison"
  | "image"
  | "imageEdit"
  | "imageComparison"
  | "traditionalVoice"
  | "realtimeVoice"
  | "voiceLive"
  | "liveTranslation"
  | "transcribe"
  | "transcriptionComparison";
export type UseCaseModality = "text" | "image" | "audio" | "video";

export type UseCaseModule = {
  id: UseCaseId;
  title: string;
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
