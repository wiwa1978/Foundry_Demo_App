export async function readJsonResponse<T>(
  response: Response,
  fallback: T,
): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export async function readPublicApiError(response: Response, fallback: string) {
  const body = await readJsonResponse<unknown>(response, null);
  if (
    body !== null &&
    typeof body === "object" &&
    "detail" in body &&
    typeof body.detail === "string"
  ) {
    return body.detail;
  }
  return fallback;
}
