import { useEffect, useRef, useState } from "react";

import type { FetchClient, TraditionalVoiceResult } from "@/api/types";
import type { UseCaseId } from "@/app/types";
import type { ApiTraceEntry } from "@/app/workspace/contracts";
import type {
  Conversation,
  FoundryRequestTrace,
  FoundryResponseTrace,
  ReasoningEffort,
} from "@/features/textChat/types";
import {
  foundrySpeechPath,
  foundryTranscriptionPath,
  runTraditionalVoice,
  traditionalVoiceEndpoint,
} from "@/features/voice/api";
import { summarizeTraditionalVoiceResult } from "@/features/voice/audioUtils";
import {
  getRecorderMimeType,
  stopStreamTracks,
} from "@/features/voice/mediaSessionUtils";
import type { TraditionalVoiceStatus } from "@/features/voice/types";

export type TraditionalVoiceRequest = {
  models: readonly string[];
  prompt: string;
  activeModel: string;
  conversation: Conversation | null;
  conversationId: string | null;
  useCase: UseCaseId;
  reasoningEffort: ReasoningEffort;
  guardrails: {
    comparisonEnabled: boolean;
    policies: readonly string[];
  };
  transcriptionModel: string;
  tts: {
    model: string;
    voice: string;
  };
};

type RecordingResource = {
  chunks: Blob[];
  closed: boolean;
  recorder: MediaRecorder;
  stream: MediaStream;
};

type InternalStatus = TraditionalVoiceStatus | "requesting";

type ApiResponseTrace = {
  label: string;
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  response: unknown;
};

export type TraditionalVoiceSessionOptions = {
  fetchClient: FetchClient;
  sessionRef: { current: number };
  appendApiTrace: (entry: Omit<ApiTraceEntry, "id" | "timestamp">) => void;
  appendFoundryTrace: (request: FoundryRequestTrace, label?: string) => void;
  appendFoundryResponseTrace: (
    response: FoundryResponseTrace,
    label?: string,
  ) => void;
  appendApiResponseTrace: (trace: ApiResponseTrace) => void;
  onComplete: (result: TraditionalVoiceResult) => void;
};

function closeRecording(resource: RecordingResource | null) {
  if (!resource || resource.closed) return;
  resource.closed = true;
  stopStreamTracks(resource.stream);
}

function snapshotRequest(
  request: TraditionalVoiceRequest,
): TraditionalVoiceRequest {
  return {
    ...request,
    models: [...request.models],
    guardrails: {
      ...request.guardrails,
      policies: [...request.guardrails.policies],
    },
    tts: { ...request.tts },
    conversation: request.conversation ? { ...request.conversation } : null,
  };
}

export function useTraditionalVoiceSession({
  fetchClient,
  sessionRef,
  appendApiTrace,
  appendFoundryTrace,
  appendFoundryResponseTrace,
  appendApiResponseTrace,
  onComplete,
}: TraditionalVoiceSessionOptions) {
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const statusRef = useRef<InternalStatus>("idle");
  const recordingRef = useRef<RecordingResource | null>(null);
  const callbacksRef = useRef({
    appendApiTrace,
    appendFoundryTrace,
    appendFoundryResponseTrace,
    appendApiResponseTrace,
    onComplete,
  });
  callbacksRef.current = {
    appendApiTrace,
    appendFoundryTrace,
    appendFoundryResponseTrace,
    appendApiResponseTrace,
    onComplete,
  };
  const [status, setStatus] = useState<TraditionalVoiceStatus>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<TraditionalVoiceResult | null>(null);

  function isCurrent(generation: number, session: number) {
    return (
      mountedRef.current &&
      generationRef.current === generation &&
      sessionRef.current === session
    );
  }

  function updateStatus(nextStatus: InternalStatus) {
    statusRef.current = nextStatus;
    if (mountedRef.current && nextStatus !== "requesting")
      setStatus(nextStatus);
  }

  function appendPipelineTraces(
    pipelineResult: TraditionalVoiceResult,
    responseStatus: number,
  ) {
    const callbacks = callbacksRef.current;
    callbacks.appendApiTrace({
      direction: "api_foundry",
      label: `Foundry transcription (${pipelineResult.transcription.model})`,
      method: "POST",
      url: foundryTranscriptionPath,
      request: pipelineResult.transcription.foundry_request?.payload,
    });
    callbacks.appendApiTrace({
      direction: "foundry_api",
      label: "Foundry transcription response",
      method: "RECV",
      url: foundryTranscriptionPath,
      durationMs: pipelineResult.transcription.duration_ms,
      response: pipelineResult.transcription.foundry_response?.extracted,
    });
    for (const variant of pipelineResult.results) {
      const variantLabel = variant.guardrail_variant ?? "standard";
      if (variant.foundry_request) {
        callbacks.appendFoundryTrace(
          variant.foundry_request,
          `Foundry ${variantLabel} chat request for ${pipelineResult.model}`,
        );
      }
      if (variant.foundry_response) {
        callbacks.appendFoundryResponseTrace(
          variant.foundry_response,
          `Foundry ${variantLabel} chat response for ${pipelineResult.model}`,
        );
      }
      if (variant.speech) {
        callbacks.appendApiTrace({
          direction: "api_foundry",
          label: `Foundry ${variantLabel} speech (${variant.speech.model})`,
          method: "POST",
          url: foundrySpeechPath,
          request: variant.speech.foundry_request?.payload,
        });
        callbacks.appendApiTrace({
          direction: "foundry_api",
          label: `Foundry ${variantLabel} speech response`,
          method: "RECV",
          url: foundrySpeechPath,
          durationMs: variant.speech.duration_ms,
          response: variant.speech.foundry_response?.payload,
        });
      }
    }
    callbacks.appendApiResponseTrace({
      label: "Traditional voice pipeline response",
      method: "RECV",
      url: traditionalVoiceEndpoint,
      status: responseStatus,
      response: summarizeTraditionalVoiceResult(pipelineResult),
    });
  }

  async function runPipeline(
    audio: Blob,
    request: TraditionalVoiceRequest,
    generation: number,
    session: number,
  ) {
    if (!isCurrent(generation, session)) return null;
    updateStatus("processing");
    setError("");
    try {
      const { response, result: pipelineResult } = await runTraditionalVoice(
        fetchClient,
        {
          audio,
          model: request.activeModel,
          transcriptionModel: request.transcriptionModel,
          ttsModel: request.tts.model,
          ttsVoice: request.tts.voice,
          useCase: request.useCase,
          conversationId: request.conversationId,
          reasoningEffort: request.reasoningEffort,
        },
      );
      if (!isCurrent(generation, session)) return null;
      appendPipelineTraces(pipelineResult, response.status);
      setResult(pipelineResult);
      updateStatus("complete");
      callbacksRef.current.onComplete(pipelineResult);
      return pipelineResult;
    } catch (caught) {
      if (!isCurrent(generation, session)) return null;
      updateStatus("idle");
      setError(
        caught instanceof Error
          ? caught.message
          : "Traditional Foundry voice pipeline failed.",
      );
      return null;
    }
  }

  function stop() {
    if (statusRef.current === "requesting") {
      generationRef.current += 1;
      updateStatus("idle");
      return;
    }
    const recorder = recordingRef.current?.recorder;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  function invalidate() {
    generationRef.current += 1;
    updateStatus("idle");
    const resource = recordingRef.current;
    recordingRef.current = null;
    if (resource?.recorder.state !== "inactive") resource?.recorder.stop();
    closeRecording(resource);
  }

  async function start(request: TraditionalVoiceRequest) {
    if (statusRef.current === "recording") {
      stop();
      return;
    }
    if (
      statusRef.current === "processing" ||
      statusRef.current === "requesting"
    ) {
      return;
    }
    if (!request.activeModel) {
      setError(
        "Select a chat model for the middle step of the STT -> Chat -> TTS pipeline.",
      );
      return;
    }
    if (!request.transcriptionModel || !request.tts.model) {
      setError("Select both an STT deployment and a TTS deployment.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError(
        "This browser does not support audio recording with MediaRecorder.",
      );
      return;
    }

    const requestSnapshot = snapshotRequest(request);
    const session = sessionRef.current;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    updateStatus("requesting");
    setError("");
    setResult(null);
    let pendingStream: MediaStream | null = null;
    let pendingResource: RecordingResource | null = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      pendingStream = stream;
      if (!isCurrent(generation, session)) {
        stopStreamTracks(stream);
        pendingStream = null;
        return;
      }
      const mimeType = getRecorderMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      const resource: RecordingResource = {
        chunks: [],
        closed: false,
        recorder,
        stream,
      };
      pendingResource = resource;
      pendingStream = null;
      recordingRef.current = resource;
      recorder.addEventListener("dataavailable", (event) => {
        if (!isCurrent(generation, session) || resource.closed) return;
        if (event.data.size > 0) resource.chunks.push(event.data);
      });
      recorder.addEventListener("error", () => {
        if (!isCurrent(generation, session)) return;
        generationRef.current += 1;
        recordingRef.current = null;
        closeRecording(resource);
        updateStatus("idle");
        setError(
          "Audio recording failed. Check microphone permissions and try again.",
        );
      });
      recorder.addEventListener("stop", () => {
        const current = isCurrent(generation, session);
        const chunks = resource.chunks.splice(0);
        if (recordingRef.current === resource) recordingRef.current = null;
        closeRecording(resource);
        if (!current) return;
        if (!chunks.length) {
          updateStatus("idle");
          setError("No audio was captured.");
          return;
        }
        void runPipeline(
          new Blob(chunks, { type: recorder.mimeType || "audio/webm" }),
          requestSnapshot,
          generation,
          session,
        );
      });
      recorder.start();
      if (!isCurrent(generation, session)) {
        recorder.stop();
        closeRecording(resource);
        return;
      }
      updateStatus("recording");
    } catch (caught) {
      stopStreamTracks(pendingStream);
      closeRecording(pendingResource);
      if (!isCurrent(generation, session)) return;
      recordingRef.current = null;
      updateStatus("idle");
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to start microphone recording.",
      );
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      const resource = recordingRef.current;
      recordingRef.current = null;
      if (resource?.recorder.state !== "inactive") resource?.recorder.stop();
      closeRecording(resource);
    };
  }, []);

  return {
    error,
    invalidate,
    result,
    start,
    status,
    stop,
  };
}
