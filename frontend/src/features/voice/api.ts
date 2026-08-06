import type { FetchClient } from "@/features/textChat/api";

async function publicError(response: Response, fallback: string) {
  const data = (await response.json().catch(() => ({}))) as { detail?: string };
  return data.detail ?? fallback;
}

export async function createRealtimeSession(
  fetchClient: FetchClient,
  request: { model: string; instructions: string; voice: string },
) {
  const response = await fetchClient(
    "/api/realtime/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    { label: "Create realtime session", request, responseKind: "json" },
  );
  if (!response.ok) throw new Error(await publicError(response, "Failed to create realtime session."));
  return response;
}

export async function transcribeRecording(
  fetchClient: FetchClient,
  audio: Blob,
  model: string,
  language = "en-US",
) {
  const form = new FormData();
  form.append("audio", audio, "transcription.wav");
  form.append("model", model);
  form.append("language", language);
  const response = await fetchClient(
    "/api/transcriptions",
    { method: "POST", body: form },
    { label: "Transcribe recorded audio", responseKind: "json" },
  );
  if (!response.ok) throw new Error(await publicError(response, "Transcription failed."));
  return response;
}

export function voiceLiveUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/voice-live`;
}

export function liveInterpreterUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/live-interpreter`;
}
