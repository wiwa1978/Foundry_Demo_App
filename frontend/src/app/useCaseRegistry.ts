import { browserVoiceUseCase } from "@media/browser_voice/module";
import { contentExtractorUseCase } from "@media/content_extractor/module";
import { documentQaUseCase } from "@media/document_qa/module";
import { imageComparisonUseCase } from "@media/image_comparison/module";
import { imageToImageUseCase } from "@media/image_to_image/module";
import { liveTranslationUseCase } from "@media/live_translation/module";
import { realtimeTranscriptionWebRtcUseCase } from "@media/realtime_transcription_webrtc/module";
import { realtimeTranscriptionWebSocketUseCase } from "@media/realtime_transcription_websocket/module";
import { realtimeTranslationWebRtcUseCase } from "@media/realtime_translation_webrtc/module";
import { realtimeTranslationWebSocketUseCase } from "@media/realtime_translation_websocket/module";
import { realtimeVoiceUseCase } from "@media/realtime_voice/module";
import { reasoningComparisonUseCase } from "@media/reasoning_comparison/module";
import { transcribeUseCase } from "@media/recorded_transcription/module";
import { traditionalVoiceUseCase } from "@media/stt_chat_tts/module";
import { textChatUseCase } from "@media/text_chat/module";
import { comparisonUseCase } from "@media/text_chat_comparison/module";
import { textToImageUseCase } from "@media/text_to_image/module";
import { textTranslationUseCase } from "@media/text_translation/module";
import { transcriptionComparisonUseCase } from "@media/transcription_comparison/module";
import { voiceLiveUseCase } from "@media/voice_live/module";
import { youtubeRealtimeTranscriptionUseCase } from "@media/youtube_realtime_transcription/module";
import { youtubeSummaryUseCase } from "@media/youtube_summary/module";

import type {
  UseCaseModule,
  UseCaseWorkspace,
  WorkspaceRenderer,
} from "@/app/types";
import { agentResearchUseCase } from "@/features/useCases/agentResearch";
import { hostedAgentUseCase } from "@/features/useCases/hostedAgent";

export type RegisteredUseCase = UseCaseModule & { renderer: WorkspaceRenderer };

const rendererByWorkspace = {
  chat: "chat",
  contentExtractor: "chat",
  agentResearch: "agent",
  hostedAgent: "agent",
  comparison: "chat",
  image: "image",
  imageEdit: "image",
  imageComparison: "image",
  traditionalVoice: "voice",
  realtimeVoice: "voice",
  realtimeTranscriptionWebRtc: "voice",
  realtimeTranscriptionWebSocket: "voice",
  realtimeTranslationWebRtc: "voice",
  realtimeTranslationWebSocket: "voice",
  voiceLive: "voice",
  liveTranslation: "voice",
  textTranslation: "chat",
  transcribe: "voice",
  transcriptionComparison: "voice",
  youtubeSummary: "chat",
  youtubeRealtimeTranscription: "chat",
} as const satisfies Record<UseCaseWorkspace, WorkspaceRenderer>;

const definitions = [
  textChatUseCase,
  agentResearchUseCase,
  hostedAgentUseCase,
  comparisonUseCase,
  reasoningComparisonUseCase,
  documentQaUseCase,
  contentExtractorUseCase,
  textTranslationUseCase,
  textToImageUseCase,
  imageComparisonUseCase,
  imageToImageUseCase,
  youtubeSummaryUseCase,
  youtubeRealtimeTranscriptionUseCase,
  browserVoiceUseCase,
  traditionalVoiceUseCase,
  transcribeUseCase,
  transcriptionComparisonUseCase,
  realtimeTranscriptionWebRtcUseCase,
  realtimeTranscriptionWebSocketUseCase,
  realtimeTranslationWebRtcUseCase,
  realtimeTranslationWebSocketUseCase,
  liveTranslationUseCase,
  realtimeVoiceUseCase,
  voiceLiveUseCase,
] as const;

export function registerUseCases(
  modules: readonly UseCaseModule[],
): RegisteredUseCase[] {
  const ids = new Set<string>();
  return modules.map((module) => {
    if (ids.has(module.id)) {
      throw new Error(`Duplicate use-case registration: ${module.id}`);
    }
    if (
      !module.title.trim() ||
      !module.modalities.length ||
      !module.implementation.length ||
      !module.codeSnippet.code.trim()
    ) {
      throw new Error(`Incomplete use-case registration: ${module.id}`);
    }
    ids.add(module.id);
    return { ...module, renderer: rendererByWorkspace[module.workspace] };
  });
}

export const useCaseModules = registerUseCases(definitions);
