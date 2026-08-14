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
