import { readPublicApiError } from "@/api/errors";
import type { FetchClient } from "@/api/types";

export type ImageSample = {
  id: string;
  name: string;
  attribution: string;
  source_url: string;
  image_url: string;
};

export async function listImageSamples(
  fetchClient: FetchClient,
  signal?: AbortSignal,
) {
  const response = await fetchClient(
    "/api/images/samples",
    { signal },
    { label: "Load image samples", responseKind: "json" },
  );
  if (!response.ok)
    throw new Error(
      await readPublicApiError(response, "Could not load image samples."),
    );
  return (await response.json()) as ImageSample[];
}

export async function getImageSample(
  fetchClient: FetchClient,
  sample: ImageSample,
) {
  const response = await fetchClient(
    sample.image_url,
    {},
    { label: `Load ${sample.name}`, traceResponse: false },
  );
  if (!response.ok)
    throw new Error(
      await readPublicApiError(response, "Could not load image sample."),
    );
  const blob = await response.blob();
  return new File([blob], sample.id, { type: blob.type });
}

export async function generateImage(
  fetchClient: FetchClient,
  request: { model: string; prompt: string; width: number; height: number },
  signal?: AbortSignal,
) {
  const response = await fetchClient(
    "/api/images/generate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    },
    {
      label: `Generate image with ${request.model}`,
      request,
      responseKind: "json",
    },
  );
  if (!response.ok)
    throw new Error(
      await readPublicApiError(response, "Image request failed."),
    );
  return response;
}

export async function editImage(
  fetchClient: FetchClient,
  request: {
    model: string;
    prompt: string;
    width: number;
    height: number;
    image: File;
  },
  signal?: AbortSignal,
) {
  const form = new FormData();
  form.append("image", request.image);
  form.append("model", request.model);
  form.append("prompt", request.prompt);
  form.append("width", String(request.width));
  form.append("height", String(request.height));
  const response = await fetchClient(
    "/api/images/edit",
    { method: "POST", body: form, signal },
    {
      label: "Edit image",
      request: { ...request, image: request.image.name },
      responseKind: "json",
    },
  );
  if (!response.ok)
    throw new Error(
      await readPublicApiError(response, "Image request failed."),
    );
  return response;
}
