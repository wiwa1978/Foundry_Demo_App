export type UseCaseId =
  | "text_chat"
  | "document_qa"
  | "comparison"
  | "browser_voice"
  | "traditional_voice"
  | "transcribe"
  | "realtime_voice"
  | "text_to_image"
  | "image_comparison";

export type UseCaseIconName = "chat" | "comparison" | "browserVoice" | "documents" | "image" | "voiceWave";
export type UseCaseWorkspace = "chat" | "comparison" | "image" | "imageComparison" | "traditionalVoice" | "realtimeVoice" | "transcribe";

export type UseCaseModule = {
  id: UseCaseId;
  title: string;
  shortTitle: string;
  description: string;
  badge: string;
  icon: UseCaseIconName;
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
  showDocumentControls?: boolean;
  showChatComposer?: boolean;
  enableComposerDictation?: boolean;
};
