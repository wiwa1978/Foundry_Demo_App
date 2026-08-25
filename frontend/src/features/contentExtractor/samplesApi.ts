import { readPublicApiError } from "@/api/errors";
import type { FetchClient } from "@/api/types";

import type { ContentExtractorMode, ContentExtractorSample } from "./types";

export async function listContentExtractorSamples(
  fetchClient: FetchClient,
  mode: Exclude<ContentExtractorMode, "image">,
  signal?: AbortSignal,
) {
  const response = await fetchClient(
    `/api/content-extractor/samples/${mode}`,
    { signal },
    { label: `Load ${mode} samples`, responseKind: "json" },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(response, `Could not load ${mode} samples.`),
    );
  }
  return (await response.json()) as ContentExtractorSample[];
}

export async function getContentExtractorSample(
  fetchClient: FetchClient,
  sample: ContentExtractorSample,
) {
  const response = await fetchClient(
    sample.sample_url,
    {},
    { label: `Load ${sample.name}`, traceResponse: false },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(
        response,
        "Could not load Content Extractor sample.",
      ),
    );
  }
  const blob = await response.blob();
  return new File([blob], sample.id, { type: blob.type });
}
