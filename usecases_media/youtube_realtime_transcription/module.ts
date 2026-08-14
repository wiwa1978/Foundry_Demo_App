import type { UseCaseModule } from "@/app/types";

export const youtubeRealtimeTranscriptionUseCase: UseCaseModule = {
  id: "youtube_realtime_transcription",
  title: "Youtube Video Transcription",
  shortTitle: "Youtube Video Transcription",
  description:
    "Stream a public YouTube video's audio through a Foundry realtime transcription deployment.",
  badge: "Audio",
  typeLabel: "Realtime Transcription",
  icon: "video",
  modalities: ["video", "audio", "text"],
  implementation: [
    "The backend validates the YouTube URL and downloads bounded audio with the same safeguards as the summary fallback.",
    "Audio is converted to 24 kHz mono PCM and streamed into a realtime transcription session.",
    "The workspace displays realtime transcript deltas from `gpt-live-transcribe` or `gpt-realtime-whisper` deployments.",
  ],
  codeSnippet: {
    title: "Realtime YouTube transcription flow",
    language: "python",
    code: [
      "video_id = extract_video_id(request.url)",
      "pcm_chunks = stream_youtube_pcm24(video_id)",
      "stream_pcm_to_realtime_transcription(pcm_chunks, request.model)",
    ].join("\n"),
  },
  workspace: "youtubeRealtimeTranscription",
};
