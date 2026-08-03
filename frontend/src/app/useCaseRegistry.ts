import { browserVoiceUseCase } from "@/features/useCases/browserVoice";
import { comparisonUseCase } from "@/features/useCases/comparison";
import { documentQaUseCase } from "@/features/useCases/documentQa";
import { realtimeVoiceUseCase } from "@/features/useCases/realtimeVoice";
import { textChatUseCase } from "@/features/useCases/textChat";
import { traditionalVoiceUseCase } from "@/features/useCases/traditionalVoice";

export const useCaseModules = [
  textChatUseCase,
  documentQaUseCase,
  comparisonUseCase,
  browserVoiceUseCase,
  traditionalVoiceUseCase,
  realtimeVoiceUseCase,
] as const;
