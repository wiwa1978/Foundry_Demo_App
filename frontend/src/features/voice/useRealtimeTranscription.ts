import { useCallback, useEffect, useRef, useState } from "react";

import type { FetchClient } from "@/api/types";
import {
  createRealtimeTranscriptionSession,
  exchangeRealtimeSdp,
  realtimeTranscriptionWebSocketUrl,
} from "@/features/voice/api";
import { stopMediaTracks } from "@/features/voice/mediaSessionUtils";
import type {
  RealtimeTranscriptionDelay,
  RealtimeServerEvent,
  RealtimeStatus,
  RealtimeTranscriptionTransport,
  RealtimeTranscriptionTurnDetection,
} from "@/features/voice/types";

type Resources = {
  abortController: AbortController;
  audioContext: AudioContext | null;
  dataChannel: RTCDataChannel | null;
  mediaStream: MediaStream | null;
  peerConnection: RTCPeerConnection | null;
  silentOutput: GainNode | null;
  socket: WebSocket | null;
  source: MediaStreamAudioSourceNode | null;
  worklet: AudioWorkletNode | null;
  closed: boolean;
};

export function useRealtimeTranscription({
  fetchClient,
  transport,
}: {
  fetchClient: FetchClient;
  transport: RealtimeTranscriptionTransport;
}) {
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [error, setError] = useState("");
  const [model, setModel] = useState("gpt-realtime-whisper");
  const [transcript, setTranscript] = useState("");
  const [language, setLanguage] = useState("auto");
  const [delay, setDelay] = useState<RealtimeTranscriptionDelay>("default");
  const [turnDetection, setTurnDetection] =
    useState<RealtimeTranscriptionTurnDetection>(
      transport === "websocket" ? "none" : "server_vad",
    );
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const statusRef = useRef<RealtimeStatus>("idle");
  const resourcesRef = useRef<Resources | null>(null);
  const transcriptItemsRef = useRef(
    new Map<string, { text: string; sequence: number; completed: boolean }>(),
  );
  const fallbackSequenceRef = useRef(0);

  function updateStatus(next: RealtimeStatus) {
    statusRef.current = next;
    if (mountedRef.current) setStatus(next);
  }

  function isCurrent(generation: number) {
    return mountedRef.current && generationRef.current === generation;
  }

  function renderTranscript() {
    setTranscript(
      [...transcriptItemsRef.current.values()]
        .sort((left, right) => left.sequence - right.sequence)
        .map((item) => item.text)
        .filter((text) => text.trim())
        .join(" "),
    );
  }

  function handleEvent(generation: number, event: RealtimeServerEvent) {
    if (!isCurrent(generation)) return;
    if (event.type === "ready") {
      if (event.model) setModel(event.model);
      updateStatus("live");
      return;
    }
    const itemId = event.item_id ?? "current";
    const existing = transcriptItemsRef.current.get(itemId);
    const sequence =
      event.sequence ??
      existing?.sequence ??
      (fallbackSequenceRef.current += 1);
    if (
      event.type === "conversation.item.input_audio_transcription.delta" &&
      event.delta
    ) {
      transcriptItemsRef.current.set(itemId, {
        text: `${existing?.text ?? ""}${event.delta}`,
        sequence,
        completed: false,
      });
      renderTranscript();
      return;
    }
    if (
      event.type === "conversation.item.input_audio_transcription.completed" &&
      event.transcript
    ) {
      transcriptItemsRef.current.set(itemId, {
        text: event.transcript.trim(),
        sequence,
        completed: true,
      });
      renderTranscript();
      return;
    }
    if (event.type === "error" || event.type === "session.error") {
      setError(
        event.error?.message ?? "Realtime transcription reported an error.",
      );
    }
  }

  const closeResources = useCallback((resources: Resources | null) => {
    if (!resources || resources.closed) return;
    resources.closed = true;
    resources.abortController.abort();
    resources.worklet?.disconnect();
    resources.silentOutput?.disconnect();
    resources.source?.disconnect();
    resources.dataChannel?.close();
    if (resources.socket?.readyState === WebSocket.OPEN) {
      resources.socket.send(JSON.stringify({ type: "stop" }));
    }
    resources.socket?.close();
    stopMediaTracks(resources.peerConnection, resources.mediaStream);
    resources.peerConnection?.close();
    if (resources.audioContext?.state !== "closed") {
      void resources.audioContext?.close();
    }
  }, []);

  const closeCurrentResources = useCallback(() => {
    generationRef.current += 1;
    const resources = resourcesRef.current;
    resourcesRef.current = null;
    closeResources(resources);
  }, [closeResources]);

  function stop() {
    const resources = resourcesRef.current;
    if (
      transport === "websocket" &&
      resources?.socket?.readyState === WebSocket.OPEN
    ) {
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
      }, 2500);
      return;
    }
    closeCurrentResources();
    updateStatus("idle");
  }

  async function startWebRtc(generation: number, resources: Resources) {
    const session = await createRealtimeTranscriptionSession(
      fetchClient,
      {
        language: language === "auto" ? null : language,
        delay: delay === "default" ? null : delay,
        turn_detection: turnDetection,
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
    mediaStream
      .getTracks()
      .forEach((track) => peerConnection.addTrack(track, mediaStream));
    const channel = peerConnection.createDataChannel("realtime-channel");
    resources.dataChannel = channel;
    channel.addEventListener("open", () => {
      if (isCurrent(generation)) updateStatus("live");
    });
    channel.addEventListener("message", (message) => {
      try {
        handleEvent(generation, JSON.parse(String(message.data)));
      } catch {
        if (isCurrent(generation))
          setError("Received an unreadable Realtime event.");
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
    resources.audioContext = context;
    await context.audioWorklet.addModule(
      new URL("../../realtime-transcription-worklet.js", import.meta.url),
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
      realtimeTranscriptionWebSocketUrl({
        language: language === "auto" ? null : language,
        delay: delay === "default" ? null : delay,
        turnDetection,
      }),
    );
    socket.binaryType = "arraybuffer";
    resources.socket = socket;
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("Realtime transcription WebSocket failed.")),
        { once: true },
      );
    });
    socket.addEventListener("message", (message) => {
      try {
        handleEvent(generation, JSON.parse(String(message.data)));
      } catch {
        if (isCurrent(generation))
          setError("Received an unreadable Realtime event.");
      }
    });
    socket.addEventListener("close", () => {
      if (!isCurrent(generation)) return;
      closeCurrentResources();
      updateStatus("idle");
    });
    resources.source = context.createMediaStreamSource(mediaStream);
    resources.worklet = new AudioWorkletNode(
      context,
      "realtime-transcription-processor",
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
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not support microphone capture.");
      return;
    }
    if (transport === "webrtc" && !window.RTCPeerConnection) {
      setError("This browser does not support WebRTC.");
      return;
    }
    if (
      transport === "websocket" &&
      (!window.WebSocket || !window.AudioWorkletNode)
    ) {
      setError("This browser does not support WebSocket audio capture.");
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const resources: Resources = {
      abortController: new AbortController(),
      audioContext: null,
      dataChannel: null,
      mediaStream: null,
      peerConnection: null,
      silentOutput: null,
      socket: null,
      source: null,
      worklet: null,
      closed: false,
    };
    resourcesRef.current = resources;
    transcriptItemsRef.current.clear();
    fallbackSequenceRef.current = 0;
    setTranscript("");
    setError("");
    updateStatus("connecting");
    try {
      if (transport === "webrtc") await startWebRtc(generation, resources);
      else await startWebSocket(generation, resources);
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
          : "Failed to start realtime transcription.",
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
    delay,
    error,
    language,
    model,
    setDelay,
    setLanguage,
    setTurnDetection,
    start,
    status,
    stop,
    transcript,
    turnDetection,
  };
}
