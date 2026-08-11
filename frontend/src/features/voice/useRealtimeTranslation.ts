import { useCallback, useEffect, useRef, useState } from "react";

import { realtimeTranslationWebSocketUrl } from "@/features/voice/api";
import type {
  RealtimeStatus,
  RealtimeTranslationServerEvent,
} from "@/features/voice/types";

type Resources = {
  context: AudioContext;
  mediaStream: MediaStream | null;
  playbackSources: Set<AudioBufferSourceNode>;
  silentOutput: GainNode | null;
  socket: WebSocket | null;
  source: MediaStreamAudioSourceNode | null;
  worklet: AudioWorkletNode | null;
  closed: boolean;
};

function decodeBase64Pcm(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

export function useRealtimeTranslation() {
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [error, setError] = useState("");
  const [model, setModel] = useState("gpt-realtime-translate");
  const [transcriptionModel, setTranscriptionModel] = useState(
    "gpt-realtime-whisper",
  );
  const [targetLanguage, setTargetLanguage] = useState("fr");
  const [sourceTranscript, setSourceTranscript] = useState("");
  const [translatedTranscript, setTranslatedTranscript] = useState("");
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const statusRef = useRef<RealtimeStatus>("idle");
  const resourcesRef = useRef<Resources | null>(null);
  const playAtRef = useRef(0);

  function isCurrent(generation: number) {
    return mountedRef.current && generationRef.current === generation;
  }

  function updateStatus(next: RealtimeStatus) {
    statusRef.current = next;
    if (mountedRef.current) setStatus(next);
  }

  const closeResources = useCallback((resources: Resources | null) => {
    if (!resources || resources.closed) return;
    resources.closed = true;
    resources.worklet?.disconnect();
    resources.source?.disconnect();
    resources.silentOutput?.disconnect();
    resources.socket?.close();
    resources.mediaStream?.getTracks().forEach((track) => track.stop());
    resources.playbackSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // The source may already have ended.
      }
      source.disconnect();
    });
    resources.playbackSources.clear();
    void resources.context.close().catch(() => undefined);
    playAtRef.current = 0;
  }, []);

  const closeCurrentResources = useCallback(() => {
    generationRef.current += 1;
    const resources = resourcesRef.current;
    resourcesRef.current = null;
    closeResources(resources);
  }, [closeResources]);

  function playAudio(
    generation: number,
    resources: Resources,
    event: RealtimeTranslationServerEvent,
  ) {
    if (!event.delta || !isCurrent(generation)) return;
    const pcm = new Int16Array(decodeBase64Pcm(event.delta));
    const sampleRate = event.sample_rate || 24000;
    const channels = Math.max(1, event.channels || 1);
    const frameCount = Math.floor(pcm.length / channels);
    const buffer = resources.context.createBuffer(
      channels,
      frameCount,
      sampleRate,
    );
    for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
      const channel = buffer.getChannelData(channelIndex);
      for (let index = 0; index < frameCount; index += 1) {
        channel[index] = pcm[index * channels + channelIndex] / 0x8000;
      }
    }
    const source = resources.context.createBufferSource();
    source.buffer = buffer;
    source.connect(resources.context.destination);
    resources.playbackSources.add(source);
    source.onended = () => resources.playbackSources.delete(source);
    const startAt = Math.max(resources.context.currentTime, playAtRef.current);
    source.start(startAt);
    playAtRef.current = startAt + buffer.duration;
  }

  function handleEvent(
    generation: number,
    resources: Resources,
    event: RealtimeTranslationServerEvent,
  ) {
    if (!isCurrent(generation)) return;
    if (event.type === "ready") {
      if (event.model) setModel(event.model);
      if (event.transcription_model)
        setTranscriptionModel(event.transcription_model);
      updateStatus("live");
    } else if (event.type === "session.input_transcript.delta" && event.delta) {
      setSourceTranscript((current) => current + event.delta);
    } else if (
      event.type === "session.output_transcript.delta" &&
      event.delta
    ) {
      setTranslatedTranscript((current) => current + event.delta);
    } else if (event.type === "session.output_audio.delta") {
      playAudio(generation, resources, event);
    } else if (event.type === "session.closed") {
      closeCurrentResources();
      updateStatus("idle");
    } else if (event.type === "error") {
      setError(
        event.error?.message ?? "Realtime translation reported an error.",
      );
    }
  }

  function stop() {
    const resources = resourcesRef.current;
    if (!resources?.socket || resources.socket.readyState !== WebSocket.OPEN) {
      closeCurrentResources();
      updateStatus("idle");
      return;
    }
    updateStatus("stopping");
    resources.worklet?.disconnect();
    resources.source?.disconnect();
    resources.mediaStream?.getTracks().forEach((track) => track.stop());
    resources.socket.send(JSON.stringify({ type: "stop" }));
    window.setTimeout(() => {
      if (resourcesRef.current === resources) {
        closeCurrentResources();
        updateStatus("idle");
      }
    }, 5500);
  }

  async function start() {
    if (statusRef.current !== "idle") {
      stop();
      return;
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      !window.WebSocket ||
      !window.AudioWorkletNode
    ) {
      setError("This browser does not support realtime translation audio.");
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const context = new AudioContext();
    const resources: Resources = {
      context,
      mediaStream: null,
      playbackSources: new Set(),
      silentOutput: null,
      socket: null,
      source: null,
      worklet: null,
      closed: false,
    };
    resourcesRef.current = resources;
    setError("");
    setSourceTranscript("");
    setTranslatedTranscript("");
    updateStatus("connecting");
    try {
      await context.audioWorklet.addModule(
        new URL("../../realtime-translation-worklet.js", import.meta.url),
      );
      await context.resume();
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
      const socket = new WebSocket(
        realtimeTranslationWebSocketUrl(targetLanguage),
      );
      socket.binaryType = "arraybuffer";
      resources.socket = socket;
      socket.addEventListener("message", (message) => {
        try {
          handleEvent(generation, resources, JSON.parse(String(message.data)));
        } catch {
          if (isCurrent(generation))
            setError("Received an unreadable translation event.");
        }
      });
      socket.addEventListener("close", () => {
        if (!isCurrent(generation)) return;
        closeCurrentResources();
        updateStatus("idle");
      });
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener("open", () => resolve(), { once: true });
        socket.addEventListener(
          "error",
          () => reject(new Error("Realtime translation WebSocket failed.")),
          { once: true },
        );
      });
      resources.source = context.createMediaStreamSource(mediaStream);
      resources.worklet = new AudioWorkletNode(
        context,
        "realtime-translation-processor",
      );
      resources.worklet.port.onmessage = (
        message: MessageEvent<ArrayBuffer>,
      ) => {
        if (isCurrent(generation) && socket.readyState === WebSocket.OPEN) {
          socket.send(message.data);
        }
      };
      resources.silentOutput = context.createGain();
      resources.silentOutput.gain.value = 0;
      resources.source.connect(resources.worklet);
      resources.worklet
        .connect(resources.silentOutput)
        .connect(context.destination);
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
          : "Failed to start realtime translation.",
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
    model,
    setTargetLanguage,
    sourceTranscript,
    start,
    status,
    stop,
    targetLanguage,
    translatedTranscript,
    transcriptionModel,
  };
}
