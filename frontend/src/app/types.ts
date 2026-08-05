export type UseCaseId =
  | "text_chat"
  | "document_qa"
  | "comparison"
  | "browser_voice"
  | "traditional_voice"
  | "transcribe"
  | "realtime_voice"
  | "text_to_image";

export type UseCaseIconName = "chat" | "comparison" | "browserVoice" | "documents" | "image" | "voiceWave";
export type UseCaseWorkspace = "chat" | "comparison" | "image" | "traditionalVoice" | "realtimeVoice" | "transcribe";

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
  showDocumentControls?: boolean;
  showChatComposer?: boolean;
  enableComposerDictation?: boolean;
};
