import type { UseCaseModule } from "@/app/types";

export const dubbingUseCase: UseCaseModule = {
  id: "dubbing",
  title: "Dubbing",
  shortTitle: "Dubbing",
  description:
    "Translate spoken audio and synthesize a separate target-language audio track.",
  badge: "Audio",
  typeLabel: "Translated audio",
  icon: "voiceWave",
  modalities: ["audio", "video", "text"],
  implementation: [
    "Upload audio or video and extract normalized speech audio.",
    "Transcribe with Azure Speech, translate the transcript, and synthesize target-language speech.",
    "Download the translated audio track; this workflow does not create captions.",
  ],
  codeSnippet: {
    title: "Create a translated audio track",
    language: "python",
    code:
      "transcript = transcribe(audio)\n" +
      "translated = translate(transcript)\n" +
      "return synthesize(translated)",
  },
  workspace: "dubbing",
};
