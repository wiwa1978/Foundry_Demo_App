import { readPublicApiError } from "@/api/errors";
import type {
  FetchClient,
  RealtimeSessionResponse,
  RealtimeTranscriptionSessionResponse,
  TextToSpeechAvatarJob,
  TraditionalVoiceResult,
  TranscriptionResult,
} from "@/api/types";
import type { UseCaseId } from "@/app/types";
import type { ReasoningEffort } from "@/features/textChat/types";

export const traditionalVoiceEndpoint = "/api/voice/traditional";
export const foundryTranscriptionPath = "/audio/transcriptions";
export const foundrySpeechPath = "/audio/speech";

export async function submitTextToSpeechAvatar(
  fetchClient: FetchClient,
  request: {
    text: string;
    avatar_type: "video" | "photo";
    character: string;
    style: string;
    voice: string;
    language: string;
    custom_voice_endpoint_id: string;
    customized: boolean;
    use_built_in_voice: boolean;
    background_color: string;
    background_image: string;
  },
  signal?: AbortSignal,
) {
  const response = await fetchClient(
    "/api/text-to-speech-avatar",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    },
    {
      label: "Submit Text to Speech Avatar job",
      request,
      responseKind: "json",
    },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(
        response,
        "Failed to submit Text to Speech Avatar job.",
      ),
    );
  }
  return (await response.json()) as TextToSpeechAvatarJob;
}

export async function getTextToSpeechAvatarJob(
  fetchClient: FetchClient,
  jobId: string,
  signal?: AbortSignal,
) {
  const response = await fetchClient(
    `/api/text-to-speech-avatar/${encodeURIComponent(jobId)}`,
    { method: "GET", signal },
    {
      label: "Get Text to Speech Avatar job",
      request: { job_id: jobId },
      responseKind: "json",
    },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(
        response,
        "Failed to get Text to Speech Avatar job.",
      ),
    );
  }
  return (await response.json()) as TextToSpeechAvatarJob;
}

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

export async function createRealtimeTranscriptionSession(
  fetchClient: FetchClient,
  request: {
    model?: string;
    language: string | null;
    delay: string | null;
    turn_detection: string;
  },
  signal?: AbortSignal,
) {
  const response = await fetchClient(
    "/api/realtime-transcription/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    },
    {
      label: "Create realtime transcription session",
      request,
      responseKind: "json",
    },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(
        response,
        "Failed to create realtime transcription session.",
      ),
    );
  }
  return (await response.json()) as RealtimeTranscriptionSessionResponse;
}

export async function createRealtimeTranslationSession(
  fetchClient: FetchClient,
  request: {
    model: string;
    sourceLanguage?: string | null;
    targetLanguage: string;
    transcriptionModel?: string | null;
  },
  signal?: AbortSignal,
) {
  const response = await fetchClient(
    "/api/realtime-translation/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: request.model,
        source_language:
          request.sourceLanguage && request.sourceLanguage !== "auto"
            ? request.sourceLanguage
            : null,
        target_language: request.targetLanguage,
        transcription_model: request.transcriptionModel || null,
      }),
      signal,
    },
    {
      label: "Create realtime translation session",
      request,
      responseKind: "json",
    },
  );
  if (!response.ok) {
    throw new Error(
      await readPublicApiError(
        response,
        "Failed to create realtime translation session.",
      ),
    );
  }
  return (await response.json()) as RealtimeTranscriptionSessionResponse;
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
    language?: string;
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
  if (request.language) form.append("language", request.language);

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
  session: RealtimeSessionResponse | RealtimeTranscriptionSessionResponse,
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

export function voiceLiveAvatarUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/voice-live-avatar`;
}

export function liveInterpreterUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/live-interpreter`;
}

export function realtimeTranscriptionWebSocketUrl(options?: {
  model?: string | null;
  language?: string | null;
  delay?: string | null;
  turnDetection?: string;
}) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(
    `${protocol}//${window.location.host}/api/realtime-transcription`,
  );
  if (options?.model) url.searchParams.set("model", options.model);
  if (options?.language) url.searchParams.set("language", options.language);
  if (options?.delay) url.searchParams.set("delay", options.delay);
  if (options?.turnDetection) {
    url.searchParams.set("turnDetection", options.turnDetection);
  }
  return url.toString();
}

export function realtimeTranslationWebSocketUrl(options: {
  targetLanguage: string;
  sourceLanguage?: string | null;
  model?: string | null;
  transcriptionModel?: string | null;
}) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(
    `${protocol}//${window.location.host}/api/realtime-translation`,
  );
  url.searchParams.set("targetLanguage", options.targetLanguage);
  if (options.sourceLanguage && options.sourceLanguage !== "auto") {
    url.searchParams.set("sourceLanguage", options.sourceLanguage);
  }
  if (options.model) url.searchParams.set("model", options.model);
  if (options.transcriptionModel) {
    url.searchParams.set("transcriptionModel", options.transcriptionModel);
  }
  return url.toString();
}
