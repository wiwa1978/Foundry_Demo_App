import { useCallback, useEffect, useRef, useState } from "react";

import { liveInterpreterUrl } from "@/features/voice/api";
import type {
  LiveInterpreterServerEvent,
  RealtimeStatus,
  RealtimeTranscriptEntry,
} from "@/features/voice/types";

type LiveTranslationResources = {
  abortController: AbortController;
  audioContext: AudioContext | null;
  mediaStream: MediaStream | null;
  playbackSources: Set<AudioBufferSourceNode>;
  silentOutput: GainNode | null;
  socket: WebSocket | null;
  source: MediaStreamAudioSourceNode | null;
  worklet: AudioWorkletNode | null;
  closed: boolean;
};

export function useLiveTranslation() {
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [error, setError] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [transcript, setTranscript] = useState<RealtimeTranscriptEntry[]>([]);
  const mountedRef = useRef(true);
  const statusRef = useRef<RealtimeStatus>("idle");
  const generationRef = useRef(0);
  const transcriptSequenceRef = useRef(0);
  const playAtRef = useRef(0);
  const resourcesRef = useRef<LiveTranslationResources | null>(null);

  function updateStatus(nextStatus: RealtimeStatus) {
    statusRef.current = nextStatus;
    if (mountedRef.current) setStatus(nextStatus);
  }

  function isCurrent(generation: number) {
    return mountedRef.current && generationRef.current === generation;
  }

  const closeResources = useCallback(
    (resources: LiveTranslationResources | null) => {
      if (!resources || resources.closed) return;
      resources.closed = true;
      resources.abortController.abort();
      if (resources.socket?.readyState === WebSocket.OPEN) {
        resources.socket.send(JSON.stringify({ type: "stop" }));
      }
      resources.socket?.close();
      resources.worklet?.disconnect();
      resources.source?.disconnect();
      resources.silentOutput?.disconnect();
      resources.playbackSources.forEach((source) => {
        try {
          source.stop();
        } catch {
          // A source that already ended cannot be stopped again in every browser.
        }
        source.disconnect();
      });
      resources.playbackSources.clear();
      resources.mediaStream?.getTracks().forEach((track) => track.stop());
      if (resources.audioContext)
        void resources.audioContext.close().catch(() => undefined);
      playAtRef.current = 0;
    },
    [],
  );

  const closeCurrentResources = useCallback(() => {
    generationRef.current += 1;
    const resources = resourcesRef.current;
    resourcesRef.current = null;
    closeResources(resources);
  }, [closeResources]);

  function appendTranslation(
    generation: number,
    text: string,
    detectedLanguage?: string | null,
  ) {
    const cleaned = text.trim();
    if (!cleaned || !isCurrent(generation)) return;
    transcriptSequenceRef.current += 1;
    const entry = {
      id: `live-translation-${transcriptSequenceRef.current}`,
      source: "assistant" as const,
      text: detectedLanguage
        ? `${cleaned} · detected ${detectedLanguage}`
        : cleaned,
    };
    setTranscript((current) => [...current, entry].slice(-10));
  }

  function playPcm(
    generation: number,
    resources: LiveTranslationResources,
    data: ArrayBuffer,
  ) {
    const context = resources.audioContext;
    if (!context || !isCurrent(generation)) return;
    const pcm = new Int16Array(data);
    const buffer = context.createBuffer(1, pcm.length, 16000);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < pcm.length; index += 1) {
      channel[index] = pcm[index] / 0x8000;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    resources.playbackSources.add(source);
    source.onended = () => resources.playbackSources.delete(source);
    const startAt = Math.max(context.currentTime, playAtRef.current);
    source.start(startAt);
    playAtRef.current = startAt + buffer.duration;
  }

  function failSession(
    generation: number,
    resources: LiveTranslationResources,
    message: string,
  ) {
    if (!isCurrent(generation)) return;
    generationRef.current += 1;
    resourcesRef.current = null;
    closeResources(resources);
    updateStatus("idle");
    setError(message);
  }

  function stop() {
    closeCurrentResources();
    updateStatus("idle");
  }

  function waitForSocketOpen(
    resources: LiveTranslationResources,
    socket: WebSocket,
  ) {
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        socket.removeEventListener("open", onOpen);
        socket.removeEventListener("error", onError);
        socket.removeEventListener("close", onClose);
        resources.abortController.signal.removeEventListener("abort", onAbort);
      };
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const rejectWith = (message: string) => {
        cleanup();
        reject(new Error(message));
      };
      const onError = () => rejectWith("Live Interpreter connection failed.");
      const onClose = () =>
        rejectWith("Live Interpreter closed before it was ready.");
      const onAbort = () => {
        cleanup();
        reject(new DOMException("The operation was aborted.", "AbortError"));
      };
      socket.addEventListener("open", onOpen, { once: true });
      socket.addEventListener("error", onError, { once: true });
      socket.addEventListener("close", onClose, { once: true });
      resources.abortController.signal.addEventListener("abort", onAbort, {
        once: true,
      });
    });
  }

  async function start() {
    if (statusRef.current !== "idle") {
      stop();
      return;
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      !window.AudioWorkletNode ||
      !window.WebSocket
    ) {
      setError(
        "This browser does not support the audio APIs required for Live Interpreter.",
      );
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const resources: LiveTranslationResources = {
      abortController: new AbortController(),
      audioContext: null,
      mediaStream: null,
      playbackSources: new Set(),
      silentOutput: null,
      socket: null,
      source: null,
      worklet: null,
      closed: false,
    };
    resourcesRef.current = resources;
    updateStatus("connecting");
    setError("");
    setTranscript([]);

    try {
      const context = new AudioContext();
      resources.audioContext = context;
      await context.audioWorklet.addModule(
        new URL("../../live-interpreter-worklet.js", import.meta.url),
      );
      await context.resume();
      if (!isCurrent(generation)) {
        closeResources(resources);
        return;
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      if (!isCurrent(generation)) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }
      resources.mediaStream = mediaStream;
      resources.source = context.createMediaStreamSource(resources.mediaStream);
      resources.worklet = new AudioWorkletNode(
        context,
        "live-interpreter-processor",
      );

      const socket = new WebSocket(liveInterpreterUrl());
      socket.binaryType = "arraybuffer";
      resources.socket = socket;
      await waitForSocketOpen(resources, socket);
      if (!isCurrent(generation)) {
        closeResources(resources);
        return;
      }

      const ready = new Promise<void>((resolve, reject) => {
        let readyReceived = false;
        const onAbort = () =>
          reject(new DOMException("The operation was aborted.", "AbortError"));
        resources.abortController.signal.addEventListener("abort", onAbort, {
          once: true,
        });
        socket.addEventListener("close", () => {
          resources.abortController.signal.removeEventListener(
            "abort",
            onAbort,
          );
          if (!isCurrent(generation)) return;
          const message = readyReceived
            ? "Live Interpreter connection closed."
            : "Live Interpreter closed before it was ready.";
          failSession(generation, resources, message);
          reject(new Error(message));
        });
        socket.addEventListener("message", (message) => {
          if (!isCurrent(generation)) return;
          if (message.data instanceof ArrayBuffer) {
            playPcm(generation, resources, message.data);
            return;
          }
          try {
            const event = JSON.parse(
              String(message.data),
            ) as LiveInterpreterServerEvent;
            if (event.type === "ready") {
              readyReceived = true;
              resources.abortController.signal.removeEventListener(
                "abort",
                onAbort,
              );
              resolve();
            }
            if (event.type === "translation" && event.text) {
              appendTranslation(
                generation,
                event.text,
                event.detected_language,
              );
            }
            if (event.type === "error") {
              const messageText =
                event.error ?? "Live Interpreter reported an error.";
              failSession(generation, resources, messageText);
              reject(new Error(messageText));
            }
          } catch (caught) {
            const messageText =
              caught instanceof Error
                ? caught.message
                : "Received an unreadable Live Interpreter event.";
            failSession(generation, resources, messageText);
            reject(new Error(messageText));
          }
        });
      });
      socket.send(
        JSON.stringify({ type: "start", target_language: targetLanguage }),
      );
      await ready;
      if (!isCurrent(generation) || !resources.worklet || !resources.source) {
        closeResources(resources);
        return;
      }
      resources.worklet.port.onmessage = (
        message: MessageEvent<ArrayBuffer>,
      ) => {
        if (isCurrent(generation) && socket.readyState === WebSocket.OPEN) {
          socket.send(message.data);
        }
      };
      resources.source.connect(resources.worklet);
      resources.silentOutput = context.createGain();
      resources.silentOutput.gain.value = 0;
      resources.worklet
        .connect(resources.silentOutput)
        .connect(context.destination);
      updateStatus("live");
    } catch (caught) {
      const current = isCurrent(generation);
      if (current) {
        generationRef.current += 1;
        resourcesRef.current = null;
      }
      closeResources(resources);
      if (!current) return;
      updateStatus("idle");
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to start Live Interpreter.",
      );
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      closeCurrentResources();
    };
  }, [closeCurrentResources]);

  return {
    error,
    setTargetLanguage,
    start,
    status,
    stop,
    targetLanguage,
    transcript,
  };
}
