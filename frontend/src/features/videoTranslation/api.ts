import { readPublicApiError } from "@/api/errors";
import type { FetchClient } from "@/api/types";

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

export async function translateVideo(fetchClient: FetchClient, file: File, options: {
  sourceLanguage: string; targetLanguage: string; voice: string; transcriptionModel: string;
}, signal: AbortSignal): Promise<VideoTranslationResult> {
  const body = new FormData();
  body.append("video", file);
  body.append("target_language", options.targetLanguage);
  if (options.sourceLanguage !== "auto") body.append("source_language", options.sourceLanguage);
  body.append("voice", options.voice);
  if (options.transcriptionModel) body.append("transcription_model", options.transcriptionModel);
  const response = await fetchClient("/api/video-translation/translate", { method: "POST", body, signal },
    { label: "Translate and dub video", responseKind: "json" });
  if (!response.ok) throw new Error(await readPublicApiError(response, "Video translation failed."));
  return (await response.json()) as VideoTranslationResult;
}
