import { useEffect, useRef, useState } from "react";

import type { FetchClient, TranscriptionResult } from "@/api/types";
import { transcribeRecording } from "@/features/voice/api";
import { convertAudioToWav } from "@/features/voice/audioUtils";
import {
  getRecorderMimeType,
  stopStreamTracks,
} from "@/features/voice/mediaSessionUtils";
import type { TraditionalVoiceStatus } from "@/features/voice/types";

type RecordingResource = {
  chunks: Blob[];
  closed: boolean;
  generation: number;
  recorder: MediaRecorder;
  stream: MediaStream;
};

type InternalStatus = TraditionalVoiceStatus | "requesting";

function closeRecording(resource: RecordingResource | null) {
  if (!resource || resource.closed) return;
  resource.closed = true;
  stopStreamTracks(resource.stream);
}

export function useTranscriptionSession({
  fetchClient,
  model,
  models,
}: {
  fetchClient: FetchClient;
  model: string;
  models?: string[];
}) {
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const statusRef = useRef<InternalStatus>("idle");
  const recordingRef = useRef<RecordingResource | null>(null);
  const audioUrlRef = useRef("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<TraditionalVoiceStatus>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [results, setResults] = useState<Record<string, TranscriptionResult[]>>(
    {},
  );
  const [modelErrors, setModelErrors] = useState<Record<string, string>>({});
  const [pendingModels, setPendingModels] = useState<Set<string>>(new Set());
  const [language, setLanguage] = useState("en-US");
  const [sourceName, setSourceName] = useState("");
  const [audioUrl, setAudioUrl] = useState("");

  function isCurrent(generation: number) {
    return mountedRef.current && generationRef.current === generation;
  }

  function updateStatus(nextStatus: InternalStatus) {
    statusRef.current = nextStatus;
    if (mountedRef.current && nextStatus !== "requesting")
      setStatus(nextStatus);
  }

  function replaceAudioUrl(url: string) {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = url;
    if (mountedRef.current) setAudioUrl(url);
  }

  async function runForGeneration(
    source: Blob,
    name: string,
    request: { models: string[]; language: string },
    generation: number,
  ) {
    if (!isCurrent(generation)) return null;
    updateStatus("processing");
    setError("");
    setResult(null);
    if (!models) setResults({});
    setModelErrors((current) => {
      const next = { ...current };
      for (const requestModel of request.models) delete next[requestModel];
      return next;
    });
    setPendingModels(new Set(request.models));
    setSourceName(name);
    replaceAudioUrl(URL.createObjectURL(source));
    try {
      const wav = await convertAudioToWav(source);
      if (!isCurrent(generation)) return null;
      const outcomes = await Promise.all(
        request.models.map(async (requestModel) => {
          try {
            const data = await transcribeRecording(
              fetchClient,
              wav,
              requestModel,
              request.language,
            );
            if (isCurrent(generation)) {
              setResults((current) => ({
                ...current,
                [requestModel]: [...(current[requestModel] ?? []), data],
              }));
              if (requestModel === request.models[0]) setResult(data);
              setPendingModels((current) => {
                const next = new Set(current);
                next.delete(requestModel);
                return next;
              });
            }
            return { data };
          } catch (caught) {
            const message =
              caught instanceof Error
                ? caught.message
                : "Transcription failed.";
            if (isCurrent(generation)) {
              setModelErrors((current) => ({
                ...current,
                [requestModel]: message,
              }));
              setPendingModels((current) => {
                const next = new Set(current);
                next.delete(requestModel);
                return next;
              });
            }
            return { error: message };
          }
        }),
      );
      if (!isCurrent(generation)) return null;
      const firstOutcome = outcomes[0];
      if (request.models.length === 1 && !("data" in firstOutcome)) {
        throw new Error(firstOutcome.error);
      }
      const data = "data" in firstOutcome ? firstOutcome.data : null;
      updateStatus("complete");
      return data;
    } catch (caught) {
      if (!isCurrent(generation)) return null;
      updateStatus("idle");
      setPendingModels(new Set());
      setError(
        caught instanceof Error ? caught.message : "Transcription failed.",
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

  async function start() {
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
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError(
        "This browser does not support audio recording with MediaRecorder.",
      );
      return;
    }

    const request = { models: models ?? [model], language };
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
      if (!isCurrent(generation)) {
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
        generation,
        recorder,
        stream,
      };
      pendingResource = resource;
      pendingStream = null;
      recordingRef.current = resource;
      recorder.addEventListener("dataavailable", (event) => {
        if (!isCurrent(generation) || resource.closed) return;
        if (event.data.size > 0) resource.chunks.push(event.data);
      });
      recorder.addEventListener("error", () => {
        if (!isCurrent(generation)) return;
        generationRef.current += 1;
        recordingRef.current = null;
        closeRecording(resource);
        updateStatus("idle");
        setError(
          "Audio recording failed. Check microphone permissions and try again.",
        );
      });
      recorder.addEventListener("stop", () => {
        const current = isCurrent(generation);
        const chunks = resource.chunks.splice(0);
        if (recordingRef.current === resource) recordingRef.current = null;
        closeRecording(resource);
        if (!current) return;
        if (!chunks.length) {
          updateStatus("idle");
          setError("No audio was captured.");
          return;
        }
        void runForGeneration(
          new Blob(chunks, { type: recorder.mimeType || "audio/webm" }),
          "Microphone recording",
          request,
          generation,
        );
      });
      recorder.start();
      if (!isCurrent(generation)) {
        recorder.stop();
        closeRecording(resource);
        return;
      }
      setSourceName("Microphone recording");
      updateStatus("recording");
    } catch (caught) {
      stopStreamTracks(pendingStream);
      closeRecording(pendingResource);
      if (!isCurrent(generation)) return;
      recordingRef.current = null;
      updateStatus("idle");
      setError(
        caught instanceof Error ? caught.message : "Failed to start recording.",
      );
    }
  }

  function run(source: Blob, name: string) {
    invalidate();
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    return runForGeneration(
      source,
      name,
      { models: models ?? [model], language },
      generation,
    );
  }

  function selectFile(file: File | undefined) {
    if (!file) return Promise.resolve<TranscriptionResult | null>(null);
    if (
      !file.type.startsWith("audio/") &&
      !/\.(mp3|wav|ogg|webm|m4a)$/i.test(file.name)
    ) {
      setError("Select an audio file such as MP3, WAV, OGG, WebM, or M4A.");
      return Promise.resolve<TranscriptionResult | null>(null);
    }
    return run(file, file.name);
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
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  return {
    audioUrl,
    error,
    inputRef,
    invalidate,
    language,
    modelErrors,
    pendingModels,
    result,
    results,
    run,
    selectFile,
    setLanguage,
    sourceName,
    start,
    status,
    stop,
  };
}
