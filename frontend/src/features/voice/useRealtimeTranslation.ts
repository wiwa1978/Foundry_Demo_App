import { useCallback, useEffect, useRef, useState } from "react";

import type { FetchClient } from "@/api/types";
import {
  createRealtimeTranslationSession,
  exchangeRealtimeSdp,
  realtimeTranslationWebSocketUrl,
} from "@/features/voice/api";
import {
  closeRemoteAudio,
  stopMediaTracks,
} from "@/features/voice/mediaSessionUtils";
import type {
  RealtimeStatus,
  RealtimeTranslationServerEvent,
} from "@/features/voice/types";

type Resources = {
  abortController: AbortController;
  audio: HTMLAudioElement | null;
  context: AudioContext | null;
  dataChannel: RTCDataChannel | null;
  mediaStream: MediaStream | null;
  peerConnection: RTCPeerConnection | null;
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
function getEventText(event: RealtimeTranslationServerEvent) {
  return (
    event.delta ?? event.text ?? event.transcript ?? event.translation ?? ""
  );
}

function appendCompletedText(current: string, text: string) {
  return current.endsWith(text)
    ? current
    : `${current}${current ? "\n" : ""}${text}`;
}

export function useRealtimeTranslation({
  defaultModel = "gpt-realtime-translate",
  defaultTranscriptionModel = "",
  fetchClient,
  models = [defaultModel],
  transport = "websocket",
  mode = "translation",
}: {
  defaultModel?: string;
  defaultTranscriptionModel?: string;
  fetchClient?: FetchClient;
  models?: string[];
  transport?: "webrtc" | "websocket";
  mode?: "translation" | "tutor";
} = {}) {
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [error, setError] = useState("");
  const modelOptions = Array.from(
    new Set([defaultModel, ...models].filter((value) => value.trim())),
  );
  const [model, setModel] = useState(defaultModel);
  const [transcriptionModel, setTranscriptionModel] = useState(
    defaultTranscriptionModel,
  );
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("fr");
  const [sourceTranscript, setSourceTranscript] = useState("");
  const [translatedTranscript, setTranslatedTranscript] = useState("");
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const statusRef = useRef<RealtimeStatus>("idle");
  const resourcesRef = useRef<Resources | null>(null);
  const playAtRef = useRef(0);
  const previousDefaultModelRef = useRef(defaultModel);

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
    resources.abortController.abort();
    resources.worklet?.disconnect();
    resources.source?.disconnect();
    resources.silentOutput?.disconnect();
    resources.dataChannel?.close();
    resources.socket?.close();
    closeRemoteAudio(resources.audio);
    stopMediaTracks(resources.peerConnection, resources.mediaStream);
    resources.peerConnection?.close();
    resources.playbackSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // The source may already have ended.
      }
      source.disconnect();
    });
    resources.playbackSources.clear();
    if (resources.context?.state !== "closed") {
      void resources.context?.close().catch(() => undefined);
    }
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
    if (!event.delta || !isCurrent(generation) || !resources.context) return;
    const context = resources.context;
    const pcm = new Int16Array(decodeBase64Pcm(event.delta));
    const sampleRate = event.sample_rate || 24000;
    const channels = Math.max(1, event.channels || 1);
    const frameCount = Math.floor(pcm.length / channels);
    const buffer = context.createBuffer(channels, frameCount, sampleRate);
    for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
      const channel = buffer.getChannelData(channelIndex);
      for (let index = 0; index < frameCount; index += 1) {
        channel[index] = pcm[index * channels + channelIndex] / 0x8000;
      }
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

  function handleEvent(
    generation: number,
    resources: Resources,
    event: RealtimeTranslationServerEvent,
  ) {
    if (!isCurrent(generation)) return;
    if (event.type === "ready") {
      if (event.model) setModel(event.model);
      if (event.transcription_model) {
        setTranscriptionModel(event.transcription_model);
      }
      updateStatus("live");
    } else if (
      (event.type === "session.input_transcript.delta" ||
        event.type === "conversation.item.input_audio_transcription.delta" ||
        event.type === "transcript.delta") &&
      getEventText(event)
    ) {
      setSourceTranscript((current) => current + getEventText(event));
    } else if (
      (event.type === "session.input_transcript.completed" ||
        event.type === "session.input_transcript.done" ||
        event.type ===
          "conversation.item.input_audio_transcription.completed" ||
        event.type === "transcript.completed" ||
        event.type === "transcript.done") &&
      getEventText(event)
    ) {
      setSourceTranscript((current) =>
        appendCompletedText(current, getEventText(event)),
      );
    } else if (
      (event.type === "session.output_transcript.delta" ||
        event.type === "response.text.delta" ||
        event.type === "response.audio_transcript.delta" ||
        event.type === "response.output_audio_transcript.delta" ||
        event.type === "translation.delta") &&
      getEventText(event)
    ) {
      setTranslatedTranscript((current) => current + getEventText(event));
    } else if (
      (event.type === "session.output_transcript.completed" ||
        event.type === "session.output_transcript.done" ||
        event.type === "response.text.done" ||
        event.type === "translation.completed" ||
        event.type === "translation.done") &&
      getEventText(event)
    ) {
      setTranslatedTranscript((current) =>
        appendCompletedText(current, getEventText(event)),
      );
    } else if (
      event.type === "session.output_audio.delta" ||
      event.type === "response.audio.delta" ||
      event.type === "response.output_audio.delta"
    ) {
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

  async function startWebRtc(generation: number, resources: Resources) {
    if (!fetchClient) {
      throw new Error("Realtime translation WebRTC requires an API client.");
    }
    const session = await createRealtimeTranslationSession(
      fetchClient,
      {
        model,
        sourceLanguage,
        targetLanguage,
        transcriptionModel: transcriptionModel || defaultTranscriptionModel,
        mode,
      },
      resources.abortController.signal,
    );
    if (!isCurrent(generation)) return;
    setModel(session.model);
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    if (!isCurrent(generation)) {
      mediaStream.getTracks().forEach((track) => track.stop());
      return;
    }
    resources.mediaStream = mediaStream;
    const peerConnection = new RTCPeerConnection();
    resources.peerConnection = peerConnection;
    const audio = new Audio();
    audio.autoplay = true;
    resources.audio = audio;
    peerConnection.ontrack = (event) => {
      if (!isCurrent(generation)) return;
      const [remoteStream] = event.streams;
      if (remoteStream && resources.audio) {
        resources.audio.srcObject = remoteStream;
        void resources.audio.play();
      }
    };
    mediaStream
      .getTracks()
      .forEach((track) => peerConnection.addTrack(track, mediaStream));
    const channel = peerConnection.createDataChannel("realtime-translation");
    resources.dataChannel = channel;
    channel.addEventListener("open", () => {
      if (!isCurrent(generation)) return;
      channel.send(
        JSON.stringify({
          type: "session.update",
          session: { audio: { output: { language: targetLanguage } } },
        }),
      );
      updateStatus("live");
    });
    channel.addEventListener("message", (message) => {
      try {
        handleEvent(generation, resources, JSON.parse(String(message.data)));
      } catch {
        if (isCurrent(generation))
          setError("Received an unreadable translation event.");
      }
    });
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    if (!offer.sdp) throw new Error("Browser did not create an SDP offer.");
    const answer = await exchangeRealtimeSdp(
      session,
      offer.sdp,
      globalThis.fetch,
      resources.abortController.signal,
    );
    await peerConnection.setRemoteDescription({ type: "answer", sdp: answer });
  }

  async function startWebSocket(generation: number, resources: Resources) {
    const context = new AudioContext();
    resources.context = context;
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
      realtimeTranslationWebSocketUrl({
        targetLanguage,
        sourceLanguage,
        model,
        transcriptionModel: transcriptionModel || defaultTranscriptionModel,
      }),
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
      const timeout = window.setTimeout(
        () => reject(new Error("Timed out opening realtime WebSocket.")),
        30000,
      );
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("Realtime translation WebSocket failed.")),
        { once: true },
      );
      socket.addEventListener("open", () => window.clearTimeout(timeout), {
        once: true,
      });
    });
    resources.source = context.createMediaStreamSource(mediaStream);
    resources.worklet = new AudioWorkletNode(
      context,
      "realtime-translation-processor",
    );
    resources.worklet.port.onmessage = (message: MessageEvent<ArrayBuffer>) => {
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
  }

  async function start() {
    if (statusRef.current !== "idle") {
      stop();
      return;
    }
    const webRtcUnsupported =
      transport === "webrtc" &&
      (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection);
    const webSocketUnsupported =
      transport === "websocket" &&
      (!navigator.mediaDevices?.getUserMedia ||
        !window.WebSocket ||
        !window.AudioWorkletNode);
    if (webRtcUnsupported || webSocketUnsupported) {
      setError("This browser does not support realtime translation audio.");
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const resources: Resources = {
      abortController: new AbortController(),
      audio: null,
      context: null,
      dataChannel: null,
      mediaStream: null,
      peerConnection: null,
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
      if (transport === "webrtc") {
        await startWebRtc(generation, resources);
      } else {
        await startWebSocket(generation, resources);
      }
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
    if (previousDefaultModelRef.current === defaultModel) return;
    const previousDefaultModel = previousDefaultModelRef.current;
    previousDefaultModelRef.current = defaultModel;
    if (statusRef.current === "idle" && model === previousDefaultModel) {
      setModel(defaultModel);
    }
  }, [defaultModel, model]);

  useEffect(() => {
    if (statusRef.current === "idle") {
      setTranscriptionModel(defaultTranscriptionModel);
    }
  }, [defaultTranscriptionModel]);

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
    models: modelOptions,
    setModel,
    setSourceLanguage,
    setTargetLanguage,
    sourceLanguage,
    sourceTranscript,
    start,
    status,
    stop,
    targetLanguage,
    translatedTranscript,
    transcriptionModel,
  };
}
