import { readJsonResponse, readPublicApiError } from "@/api/errors";
import type { FetchClient } from "@/api/types";

import type { YouTubeSummaryResult } from "./types";

export const youtubeSummaryEndpoint = "/api/youtube/summarize";

export async function summarizeYouTubeVideo({
  fetchClient,
  url,
  model,
  transcriptionModel,
  language,
  reasoningEffort,
  signal,
}: {
  fetchClient: FetchClient;
  url: string;
  model: string;
  transcriptionModel: string | null;
  language: string;
  reasoningEffort: string | null;
  signal: AbortSignal;
}) {
  const request = {
    url,
    model,
    transcription_model: transcriptionModel,
    language,
    reasoning_effort: reasoningEffort,
  };
  const response = await fetchClient(
    youtubeSummaryEndpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    },
    { label: "Summarize YouTube video", request, responseKind: "json" },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(response, "YouTube summary request failed."),
    );
  }
  return readJsonResponse<YouTubeSummaryResult>(response, {
    video_id: "",
    source: "generated_captions",
    language,
    transcript: "",
    summary: "",
    model,
    transcription_model: null,
    duration_ms: 0,
    usage: {},
    foundry_requests: [],
    foundry_responses: [],
  });
}
