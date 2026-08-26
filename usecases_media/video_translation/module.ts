import type { UseCaseModule } from "@/app/types";

export const videoTranslationUseCase: UseCaseModule = {
  id: "video_translation",
  title: "Video Translation",
  shortTitle: "Video Translation",
  description:
    "Prototype workflow that translates speech, creates a dubbed track, and muxes it into a video.",
  badge: "Video",
  typeLabel: "Prototype translated video",
  icon: "video",
  modalities: ["video", "audio", "text"],
  implementation: [
    "Upload a bounded local video and extract normalized mono audio with ffmpeg.",
    "Use the shared transcription, translation, and synthesis pipeline, then mux the custom dubbed track into the video.",
    "This is a custom prototype pipeline; the dedicated Azure Video Translation API is not configured here.",
  ],
  codeSnippet: {
    title: "Prototype translated video",
    language: "python",
    code: "audio = extract_audio(video)\ntranslated_audio = dub(audio)\nreturn mux(video, translated_audio)",
  },
  workspace: "videoTranslation",
};
