import type { UseCaseModule } from "@/app/types";

export const videoTranslationUseCase: UseCaseModule = {
  id: "video_translation",
  title: "Video translation",
  shortTitle: "Video translation",
  description:
    "Translate spoken content and apply AI voice dubbing across languages.",
  badge: "Video",
  typeLabel: "Translation + dubbing",
  icon: "video",
  modalities: ["video", "audio", "text"],
  implementation: [
    "Upload a bounded local video and extract normalized mono audio with ffmpeg.",
    "Transcribe, translate with Azure Translator, synthesize the selected Azure Speech voice, and mux the dubbed track back into the video.",
  ],
  codeSnippet: {
    title: "Translate and dub a video",
    language: "python",
    code: "audio = extract_audio(video)\ntranscript = transcribe(audio)\ntranslated = translate(transcript)\ndubbed = synthesize(translated)\nreturn mux(video, dubbed)",
  },
  workspace: "videoTranslation",
};
