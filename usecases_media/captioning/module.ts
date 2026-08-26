import type { UseCaseModule } from "@/app/types";

export const captioningUseCase: UseCaseModule = {
  id: "captioning",
  title: "Captioning",
  shortTitle: "Captioning",
  description:
    "Create timed, downloadable WebVTT and SRT captions from spoken audio or video.",
  badge: "Video",
  typeLabel: "Timed captions",
  icon: "video",
  modalities: ["audio", "video", "text"],
  implementation: [
    "Upload an audio or video file and extract normalized speech audio.",
    "Azure Speech recognition supplies phrase text and timing offsets.",
    "The shared caption formatter returns usable WebVTT and SRT files.",
  ],
  codeSnippet: {
    title: "Create timed captions",
    language: "python",
    code:
      "timed = transcribe_speech_audio_with_timings(audio)\n" +
      "webvtt = to_webvtt(timed['segments'])\n" +
      "srt = to_srt(timed['segments'])",
  },
  workspace: "captioning",
};
