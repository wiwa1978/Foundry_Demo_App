import { browserVoiceUseCase } from "@media/browser_voice/module";
import { documentQaUseCase } from "@media/document_qa/module";
import { imageComparisonUseCase } from "@media/image_comparison/module";
import { imageToImageUseCase } from "@media/image_to_image/module";
import { liveTranslationUseCase } from "@media/live_translation/module";
import { realtimeTranscriptionWebRtcUseCase } from "@media/realtime_transcription_webrtc/module";
import { realtimeTranscriptionWebSocketUseCase } from "@media/realtime_transcription_websocket/module";
import { realtimeTranslationWebSocketUseCase } from "@media/realtime_translation_websocket/module";
import { realtimeVoiceUseCase } from "@media/realtime_voice/module";
import { transcribeUseCase } from "@media/recorded_transcription/module";
import { traditionalVoiceUseCase } from "@media/stt_chat_tts/module";
import { textChatUseCase } from "@media/text_chat/module";
import { comparisonUseCase } from "@media/text_chat_comparison/module";
import { textToImageUseCase } from "@media/text_to_image/module";
import { transcriptionComparisonUseCase } from "@media/transcription_comparison/module";
import { voiceLiveUseCase } from "@media/voice_live/module";
import { youtubeSummaryUseCase } from "@media/youtube_summary/module";

import { agentResearchUseCase } from "@/features/useCases/agentResearch";
import { hostedAgentUseCase } from "@/features/useCases/hostedAgent";

export const useCaseModules = [
  textChatUseCase,
  agentResearchUseCase,
  hostedAgentUseCase,
  comparisonUseCase,
  documentQaUseCase,
  textToImageUseCase,
  imageComparisonUseCase,
  imageToImageUseCase,
  youtubeSummaryUseCase,
  browserVoiceUseCase,
  traditionalVoiceUseCase,
  transcribeUseCase,
  transcriptionComparisonUseCase,
  realtimeTranscriptionWebRtcUseCase,
  realtimeTranscriptionWebSocketUseCase,
  realtimeTranslationWebSocketUseCase,
  liveTranslationUseCase,
  realtimeVoiceUseCase,
  voiceLiveUseCase,
] as const;
