import type { UseCaseModule } from "@/app/types";

export const youtubeSummaryUseCase: UseCaseModule = {
  id: "youtube_summary",
  title: "Youtube Video Summarization",
  shortTitle: "Youtube Video Summarization",
  description:
    "Provide a public YouTube URL, retrieve its captions, and generate a structured summary.",
  badge: "Audio",
  typeLabel: "Transcription",
  icon: "video",
  modalities: ["video", "audio", "text"],
  implementation: [
    "The backend strictly validates the URL and extracts only a YouTube video ID.",
    "Available creator or auto-generated captions are used first; unavailable captions trigger a bounded audio download and transcription fallback using `gpt-transcribe`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, or `MAI-Transcribe-1.5`.",
    "Long transcripts are summarized in bounded sections, then reduced into a final summary with the selected Foundry chat model.",
  ],
  codeSnippet: {
    title: "Caption-first YouTube summary flow",
    language: "python",
    code: [
      "video_id = extract_video_id(request.url)",
      "captions = fetch_caption_transcript(video_id, request.language)",
      "sections = chunk_transcript(captions.text)",
      "partial_summaries = [summarize(section) for section in sections]",
      "summary = reduce_summaries(partial_summaries)",
    ].join("\n"),
  },
  workspace: "youtubeSummary",
};
