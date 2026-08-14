import { readJsonResponse, readPublicApiError } from "@/api/errors";
import type { FetchClient } from "@/api/types";

import type { ContentExtractorMode, ContentExtractorResult } from "./types";

export const contentExtractorEndpoint = "/api/content-extractor/extract";

export async function extractContent(
  fetchClient: FetchClient,
  request: { mode: ContentExtractorMode; file: File },
  signal?: AbortSignal,
): Promise<ContentExtractorResult> {
  const formData = new FormData();
  formData.set("mode", request.mode);
  formData.set("file", request.file);
  const response = await fetchClient(
    contentExtractorEndpoint,
    {
      method: "POST",
      body: formData,
      signal,
    },
    {
      label: "Azure Content Understanding extraction",
      request: { mode: request.mode, filename: request.file.name },
      responseKind: "json",
    },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(response, "Content extraction failed."),
    );
  }
  return readJsonResponse<ContentExtractorResult>(response, {
    mode: request.mode,
    filename: request.file.name,
    mime_type: request.file.type,
    analyzer_id: "prebuilt-imageSearch",
    status: "Failed",
    extracted_text: "",
    fields: {},
    warnings: [],
  });
}
