import type { FetchClient } from "@/features/textChat/api";

async function imageError(response: Response) {
  const data = (await response.json().catch(() => ({}))) as { detail?: string };
  return data.detail ?? "Image request failed.";
}

export async function generateImage(
  fetchClient: FetchClient,
  request: { model: string; prompt: string; width: number; height: number },
) {
  const response = await fetchClient(
    "/api/images/generate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    { label: `Generate image with ${request.model}`, request, responseKind: "json" },
  );
  if (!response.ok) throw new Error(await imageError(response));
  return response;
}

export async function editImage(
  fetchClient: FetchClient,
  request: { model: string; prompt: string; width: number; height: number; image: File },
) {
  const form = new FormData();
  form.append("image", request.image);
  form.append("model", request.model);
  form.append("prompt", request.prompt);
  form.append("width", String(request.width));
  form.append("height", String(request.height));
  const response = await fetchClient(
    "/api/images/edit",
    { method: "POST", body: form },
    {
      label: "Edit image",
      request: { ...request, image: request.image.name },
      responseKind: "json",
    },
  );
  if (!response.ok) throw new Error(await imageError(response));
  return response;
}
