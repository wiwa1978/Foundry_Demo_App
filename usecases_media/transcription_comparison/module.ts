import type { UseCaseModule } from "@/app/types";

export const transcriptionComparisonUseCase: UseCaseModule = {
  id: "transcription_comparison",
  title: "Side by Side Recorded Audio Transcription",
  shortTitle: "Side by Side Recorded Audio Transcription",
  description:
    "Submit one recording to multiple speech-to-text deployments and compare their transcripts side by side.",
  badge: "Audio",
  typeLabel: "Transcription",
  icon: "comparison",
  modalities: ["audio"],
  implementation: [
    "The browser records microphone audio or accepts one uploaded audio file.",
    "Audio is converted to 16 kHz mono PCM WAV once and submitted to every selected transcription deployment concurrently.",
    "Each model result or error is displayed independently for side-by-side comparison.",
  ],
  codeSnippet: {
    title: "Run one recording across transcription deployments",
    language: "python",
    code: [
      "async def transcribe(model: str):",
      "    return await run_model_call(transcribe_audio, audio=audio, model=model)",
      "",
      "results = await asyncio.gather(*(transcribe(model) for model in models))",
    ].join("\n"),
  },
  workspace: "transcriptionComparison",
  showTranscriptionComparisonControls: true,
};
