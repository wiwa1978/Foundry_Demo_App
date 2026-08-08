import type { UseCaseModule } from "@/app/types";

export const transcriptionComparisonUseCase: UseCaseModule = {
  id: "transcription_comparison",
  title: "Side by Side - Recorded Audio Transcription",
  shortTitle: "Side by Side - Audio Transcription",
  description:
    "Submit one recording to multiple speech-to-text deployments and compare their transcripts side by side.",
  badge: "Speech models",
  icon: "comparison",
  modalities: ["audio"],
  implementation: [
    "The browser records microphone audio or accepts one uploaded audio file.",
    "Audio is converted to 16 kHz mono PCM WAV once and submitted to every selected transcription deployment concurrently.",
    "Each result is displayed as soon as its model completes and remains in the session history.",
  ],
  codeSnippet: {
    title: "Run one recording across transcription deployments",
    language: "python",
    code: "results = await asyncio.gather(*(transcribe(model, audio) for model in models))",
  },
  workspace: "transcriptionComparison",
  showTranscriptionComparisonControls: true,
};
