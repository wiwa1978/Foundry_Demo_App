export type UseCaseId =
  | "text_chat"
  | "document_qa"
  | "comparison"
  | "browser_voice"
  | "traditional_voice"
  | "realtime_voice";

export type UseCaseIconName = "chat" | "comparison" | "browserVoice" | "documents" | "voiceWave";
export type UseCaseWorkspace = "chat" | "comparison" | "traditionalVoice" | "realtimeVoice";

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
