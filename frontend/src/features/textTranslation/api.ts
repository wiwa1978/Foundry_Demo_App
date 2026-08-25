import { readJsonResponse, readPublicApiError } from "@/api/errors";
import type { FetchClient } from "@/api/types";

import type { TextTranslationRequest, TextTranslationResult } from "./types";

export const textTranslationEndpoint = "/api/text-translation/translate";

export async function translateText(
  fetchClient: FetchClient,
  request: TextTranslationRequest,
  signal?: AbortSignal,
): Promise<TextTranslationResult> {
  const response = await fetchClient(
    textTranslationEndpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    },
    {
      label: "Azure Translator text translation",
      request,
      responseKind: "json",
    },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(response, "Text translation failed."),
    );
  }
  return readJsonResponse<TextTranslationResult>(response, {
    target_language: request.target_language,
    translated_text: "",
    translations: [],
  });
}

export type TextToSpeechResponse = {
  audio_base64: string;
  audio_mime_type?: string;
};

export async function synthesizeText(
  fetchClient: FetchClient,
  request: {
    text: string;
    language: string;
    voice: string;
  },
  signal?: AbortSignal,
): Promise<TextToSpeechResponse> {
  const response = await fetchClient(
    "/api/text-to-speech",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: request.text,
        model: "azure-speech",
        voice: request.voice,
        language: request.language,
        emotion: "neutral",
        pitch: "0%",
        rate: "0%",
        volume: "0%",
      }),
      signal,
    },
    {
      label: "Azure Speech translation playback",
      request,
      responseKind: "json",
    },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(response, "Azure Speech synthesis failed."),
    );
  }
  const payload = (await response.json()) as TextToSpeechResponse;
  if (!payload.audio_base64) {
    throw new Error("Azure Speech synthesis returned no audio.");
  }
  return payload;
}
