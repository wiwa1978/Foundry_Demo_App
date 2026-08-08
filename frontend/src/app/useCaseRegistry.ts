import { browserVoiceUseCase } from "@/features/useCases/browserVoice";
import { comparisonUseCase } from "@/features/useCases/comparison";
import { documentQaUseCase } from "@/features/useCases/documentQa";
import { imageComparisonUseCase } from "@/features/useCases/imageComparison";
import { imageToImageUseCase } from "@/features/useCases/imageToImage";
import { liveTranslationUseCase } from "@/features/useCases/liveTranslation";
import { realtimeVoiceUseCase } from "@/features/useCases/realtimeVoice";
import { textChatUseCase } from "@/features/useCases/textChat";
import { textToImageUseCase } from "@/features/useCases/textToImage";
import { traditionalVoiceUseCase } from "@/features/useCases/traditionalVoice";
import { transcribeUseCase } from "@/features/useCases/transcribe";
import { transcriptionComparisonUseCase } from "@/features/useCases/transcriptionComparison";
import { voiceLiveUseCase } from "@/features/useCases/voiceLive";

export const useCaseModules = [
  textChatUseCase,
  comparisonUseCase,
  documentQaUseCase,
  textToImageUseCase,
  imageComparisonUseCase,
  imageToImageUseCase,
  browserVoiceUseCase,
  traditionalVoiceUseCase,
  transcribeUseCase,
  transcriptionComparisonUseCase,
  liveTranslationUseCase,
  realtimeVoiceUseCase,
  voiceLiveUseCase,
] as const;
