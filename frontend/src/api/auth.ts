import type { AuthResponse, FetchClient } from "@/api/types";

const currentUserEndpoint = "/api/auth/me";
export const loginUrl = "/api/auth/login";
export const logoutUrl = "/api/auth/logout";

export async function loadCurrentUser(
  fetchClient: FetchClient,
  signal: AbortSignal,
) {
  const response = await fetchClient(
    currentUserEndpoint,
    { signal },
    {
      label: "Load current user",
      responseKind: "json",
      traceResponse: false,
    },
  );
  if (!response.ok) {
    return {
      authenticated: false,
      entra_auth_enabled: false,
    } satisfies AuthResponse;
  }
  return (await response.json()) as AuthResponse;
}
