import { readPublicApiError } from "@/api/errors";
import type {
  FetchClient,
  RealtimeSessionResponse,
  TraditionalVoiceResult,
  TranscriptionResult,
} from "@/api/types";
import type { UseCaseId } from "@/app/types";
import type { ReasoningEffort } from "@/features/textChat/types";

export const traditionalVoiceEndpoint = "/api/voice/traditional";
export const foundryTranscriptionPath = "/audio/transcriptions";
export const foundrySpeechPath = "/audio/speech";

export async function createRealtimeSession(
  fetchClient: FetchClient,
  request: { model: string; instructions: string; voice: string },
  signal?: AbortSignal,
) {
  const response = await fetchClient(
    "/api/realtime/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    },
    { label: "Create realtime session", request, responseKind: "json" },
  );
  if (!response.ok)
    throw new Error(
      await readPublicApiError(response, "Failed to create realtime session."),
    );
  return (await response.json()) as RealtimeSessionResponse;
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
  if (!response.ok)
    throw new Error(
      await readPublicApiError(response, "Transcription failed."),
    );
  return (await response.json()) as TranscriptionResult;
}

export async function runTraditionalVoice(
  fetchClient: FetchClient,
  request: {
    audio: Blob;
    model: string;
    transcriptionModel: string;
    ttsModel: string;
    ttsVoice: string;
    useCase: UseCaseId;
    conversationId: string | null;
    reasoningEffort: ReasoningEffort;
  },
) {
  const requestSummary = {
    model: request.model,
    conversation_id: request.conversationId,
    use_case: request.useCase,
    reasoning_effort:
      request.reasoningEffort === "default" ? null : request.reasoningEffort,
    audio: {
      type: request.audio.type || "audio/webm",
      bytes: request.audio.size,
    },
  };
  const form = new FormData();
  form.append("audio", request.audio, "foundry-voice-demo.webm");
  form.append("model", request.model);
  form.append("transcription_model", request.transcriptionModel);
  form.append("tts_model", request.ttsModel);
  form.append("tts_voice", request.ttsVoice);
  form.append("use_case", request.useCase);
  if (request.conversationId)
    form.append("conversation_id", request.conversationId);
  if (request.reasoningEffort !== "default")
    form.append("reasoning_effort", request.reasoningEffort);

  const response = await fetchClient(
    traditionalVoiceEndpoint,
    { method: "POST", body: form },
    {
      label: "Run traditional voice pipeline",
      request: requestSummary,
      responseKind: "json",
      traceResponse: false,
    },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(
        response,
        "Traditional Foundry voice pipeline failed.",
      ),
    );
  }
  const result = (await response.json()) as TraditionalVoiceResult & {
    error?: string;
  };
  if (result.error) throw new Error(result.error);
  return { response, result };
}

export async function exchangeRealtimeSdp(
  session: RealtimeSessionResponse,
  offer: string,
  fetchImplementation: typeof fetch = globalThis.fetch,
  signal?: AbortSignal,
) {
  const response = await fetchImplementation(session.webrtc_url, {
    method: "POST",
    body: offer,
    headers: {
      Authorization: `Bearer ${session.token}`,
      "Content-Type": "application/sdp",
    },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Realtime SDP exchange failed: ${await response.text()}`);
  }
  return response.text();
}

export function voiceLiveUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/voice-live`;
}

export function liveInterpreterUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/live-interpreter`;
}
