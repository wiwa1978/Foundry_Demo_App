import { readPublicApiError } from "@/api/errors";
import type { FetchClient } from "@/api/types";

export type CaptionCue = {
  index: number;
  start_ms: number;
  end_ms: number;
  text: string;
};

export type CaptioningResult = {
  transcript: string;
  language: string;
  transcription_model: string;
  captions: CaptionCue[];
  webvtt: string;
  srt: string;
};

export type DubbingResult = {
  transcript: string;
  translated_text: string;
  source_language: string | null;
  target_language: string;
  voice: string;
  audio_base64: string;
  audio_mime_type: string;
  transcription_model: string;
};

export type VideoTranslationResult = {
  transcript: string;
  translated_text: string;
  source_language: string | null;
  target_language: string;
  voice: string;
  video_base64: string;
  video_mime_type: string;
  transcription_model: string;
};

async function postMedia(
  fetchClient: FetchClient,
  endpoint: string,
  file: File,
  fields: Record<string, string>,
  signal: AbortSignal,
  label: string,
) {
  const body = new FormData();
  body.append("media", file);
  for (const [key, value] of Object.entries(fields)) {
    if (value) body.append(key, value);
  }
  const response = await fetchClient(
    endpoint,
    { method: "POST", body, signal },
    { label, responseKind: "json" },
  );
  if (!response.ok)
    throw new Error(await readPublicApiError(response, `${label} failed.`));
  return response.json();
}

export async function captionMedia(
  fetchClient: FetchClient,
  file: File,
  options: { language: string; transcriptionModel: string },
  signal: AbortSignal,
): Promise<CaptioningResult> {
  return (await postMedia(
    fetchClient,
    "/api/captioning/caption",
    file,
    {
      language: options.language,
      transcription_model: options.transcriptionModel,
    },
    signal,
    "Create timed captions",
  )) as CaptioningResult;
}

export async function dubMedia(
  fetchClient: FetchClient,
  file: File,
  options: {
    sourceLanguage: string;
    targetLanguage: string;
    voice: string;
    transcriptionModel: string;
  },
  signal: AbortSignal,
): Promise<DubbingResult> {
  return (await postMedia(
    fetchClient,
    "/api/dubbing/dub",
    file,
    {
      source_language:
        options.sourceLanguage === "auto" ? "" : options.sourceLanguage,
      target_language: options.targetLanguage,
      voice: options.voice,
      transcription_model: options.transcriptionModel,
    },
    signal,
    "Create translated audio",
  )) as DubbingResult;
}

export async function translateVideo(
  fetchClient: FetchClient,
  file: File,
  options: {
    sourceLanguage: string;
    targetLanguage: string;
    voice: string;
    transcriptionModel: string;
  },
  signal: AbortSignal,
): Promise<VideoTranslationResult> {
  const body = new FormData();
  body.append("video", file);
  body.append("target_language", options.targetLanguage);
  if (options.sourceLanguage !== "auto")
    body.append("source_language", options.sourceLanguage);
  body.append("voice", options.voice);
  if (options.transcriptionModel)
    body.append("transcription_model", options.transcriptionModel);
  const response = await fetchClient(
    "/api/video-translation/translate",
    { method: "POST", body, signal },
    { label: "Create prototype translated video", responseKind: "json" },
  );
  if (!response.ok)
    throw new Error(
      await readPublicApiError(response, "Video translation failed."),
    );
  return (await response.json()) as VideoTranslationResult;
}
