import { browserVoiceUseCase } from "@/features/useCases/browserVoice";
import { comparisonUseCase } from "@/features/useCases/comparison";
import { documentQaUseCase } from "@/features/useCases/documentQa";
import { realtimeVoiceUseCase } from "@/features/useCases/realtimeVoice";
import { textChatUseCase } from "@/features/useCases/textChat";
import { textToImageUseCase } from "@/features/useCases/textToImage";
import { traditionalVoiceUseCase } from "@/features/useCases/traditionalVoice";
import { transcribeUseCase } from "@/features/useCases/transcribe";

export const useCaseModules = [
  textChatUseCase,
  documentQaUseCase,
  textToImageUseCase,
  comparisonUseCase,
  browserVoiceUseCase,
  traditionalVoiceUseCase,
  transcribeUseCase,
  realtimeVoiceUseCase,
] as const;
