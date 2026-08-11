import type {
  FoundryRequestTrace,
  FoundryResponseTrace,
} from "@/features/textChat/types";

export type YouTubeSummaryResult = {
  video_id: string;
  source: "manual_captions" | "generated_captions" | "audio_transcription";
  language: string;
  transcript: string;
  summary: string;
  model: string;
  transcription_model: string | null;
  duration_ms: number;
  usage: Record<string, number>;
  foundry_requests: FoundryRequestTrace[];
  foundry_responses: FoundryResponseTrace[];
};
