import { useCallback, useEffect, useRef, useState } from "react";

import type { FetchClient } from "@/api/types";
import {
  createRealtimeSession,
  exchangeRealtimeSdp,
} from "@/features/voice/api";
import {
  closeRemoteAudio,
  stopMediaTracks,
} from "@/features/voice/mediaSessionUtils";
import type {
  RealtimeServerEvent,
  RealtimeStatus,
  RealtimeTranscriptEntry,
} from "@/features/voice/types";

const realtimeInstructions =
  "You are a friendly Microsoft Foundry voice demo assistant. Keep answers concise, conversational, and suitable for a live customer demo.";

type RealtimeResources = {
  abortController: AbortController;
  audio: HTMLAudioElement | null;
  dataChannel: RTCDataChannel | null;
  mediaStream: MediaStream | null;
  peerConnection: RTCPeerConnection | null;
  closed: boolean;
};

export function useRealtimeVoice({
  fetchClient,
  model,
}: {
  fetchClient: FetchClient;
  model: string;
}) {
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState<RealtimeTranscriptEntry[]>([]);
  const [sessionModel, setSessionModel] = useState<string | null>(null);
  const [guardrailStatus, setGuardrailStatus] = useState("");
  const mountedRef = useRef(true);
  const statusRef = useRef<RealtimeStatus>("idle");
  const generationRef = useRef(0);
  const transcriptSequenceRef = useRef(0);
  const resourcesRef = useRef<RealtimeResources | null>(null);

  function updateStatus(nextStatus: RealtimeStatus) {
    statusRef.current = nextStatus;
    if (mountedRef.current) setStatus(nextStatus);
  }

  function isCurrent(generation: number) {
    return mountedRef.current && generationRef.current === generation;
  }

  const closeResources = useCallback((resources: RealtimeResources | null) => {
    if (!resources || resources.closed) return;
    resources.closed = true;
    resources.abortController.abort();
    resources.dataChannel?.close();
    stopMediaTracks(resources.peerConnection, resources.mediaStream);
    resources.peerConnection?.close();
    closeRemoteAudio(resources.audio);
  }, []);

  function appendTranscript(
    source: RealtimeTranscriptEntry["source"],
    text: string,
    generation?: number,
  ) {
    const cleaned = text.trim();
    if (!cleaned || !mountedRef.current) return;
    if (generation !== undefined && !isCurrent(generation)) return;
    transcriptSequenceRef.current += 1;
    const entry = {
      id: `realtime-${transcriptSequenceRef.current}`,
      source,
      text: cleaned,
    };
    setTranscript((current) => [...current, entry].slice(-8));
  }

  function handleServerEvent(generation: number, event: RealtimeServerEvent) {
    if (!isCurrent(generation)) return;
    if (
      event.type === "conversation.item.input_audio_transcription.completed" &&
      event.transcript
    ) {
      appendTranscript("user", event.transcript, generation);
      return;
    }
    if (
      (event.type === "response.output_audio_transcript.done" ||
        event.type === "response.output_text.done") &&
      event.transcript
    ) {
      appendTranscript("assistant", event.transcript, generation);
      return;
    }
    if (
      (event.type === "response.output_audio_transcript.delta" ||
        event.type === "response.output_text.delta") &&
      event.delta
    ) {
      appendTranscript("assistant", event.delta, generation);
      return;
    }
    if (event.type === "input_audio_buffer.speech_started") {
      appendTranscript("system", "Speech detected", generation);
      return;
    }
    if (event.type === "output_audio_buffer.started") {
      appendTranscript("system", "Foundry is responding", generation);
      return;
    }
    if (event.type === "error" || event.type === "session.error") {
      setError(event.error?.message ?? "Realtime session reported an error.");
    }
  }

  const closeCurrentResources = useCallback(() => {
    generationRef.current += 1;
    const resources = resourcesRef.current;
    resourcesRef.current = null;
    closeResources(resources);
  }, [closeResources]);

  function stop() {
    closeCurrentResources();
    updateStatus("idle");
    if (!mountedRef.current) return;
    setSessionModel(null);
    setGuardrailStatus("");
    appendTranscript("system", "Realtime session stopped");
  }

  async function start() {
    if (statusRef.current !== "idle") {
      stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      setError(
        "This browser does not support the WebRTC APIs required for Foundry Realtime.",
      );
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const resources: RealtimeResources = {
      abortController: new AbortController(),
      audio: null,
      dataChannel: null,
      mediaStream: null,
      peerConnection: null,
      closed: false,
    };
    resourcesRef.current = resources;
    updateStatus("connecting");
    setError("");
    setTranscript([]);
    setSessionModel(model);

    try {
      const session = await createRealtimeSession(
        fetchClient,
        { model, voice: "alloy", instructions: realtimeInstructions },
        resources.abortController.signal,
      );
      if (!isCurrent(generation)) {
        closeResources(resources);
        return;
      }
      setGuardrailStatus(
        session.configured_guardrail_policy_name
          ? `${session.configured_guardrail_policy_name}: ${session.guardrail_status}`
          : (session.guardrail_status ?? ""),
      );

      const audio = new Audio();
      audio.autoplay = true;
      resources.audio = audio;

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
      peerConnection.ontrack = (event) => {
        if (!isCurrent(generation)) return;
        const [remoteStream] = event.streams;
        if (remoteStream && resources.audio) {
          resources.audio.srcObject = remoteStream;
          void resources.audio.play();
        }
      };
      peerConnection.onconnectionstatechange = () => {
        if (
          !isCurrent(generation) ||
          peerConnection.connectionState !== "failed"
        )
          return;
        setError("Foundry Realtime WebRTC connection failed.");
        stop();
      };
      resources.mediaStream
        .getTracks()
        .forEach((track) =>
          peerConnection.addTrack(track, resources.mediaStream as MediaStream),
        );

      const dataChannel = peerConnection.createDataChannel("realtime-channel");
      resources.dataChannel = dataChannel;
      dataChannel.addEventListener("open", () => {
        if (!isCurrent(generation)) return;
        updateStatus("live");
        setSessionModel(session.model);
        appendTranscript(
          "system",
          `Connected to ${session.model} (${session.voice})`,
          generation,
        );
      });
      dataChannel.addEventListener("message", (message) => {
        if (!isCurrent(generation)) return;
        try {
          handleServerEvent(
            generation,
            JSON.parse(String(message.data)) as RealtimeServerEvent,
          );
        } catch {
          setError("Received an unreadable Realtime event.");
        }
      });
      dataChannel.addEventListener("close", () => {
        if (!isCurrent(generation)) return;
        closeCurrentResources();
        updateStatus("idle");
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      if (!offer.sdp) {
        throw new Error(
          "Browser did not create an SDP offer for the Realtime session.",
        );
      }
      const answer = await exchangeRealtimeSdp(
        session,
        offer.sdp,
        globalThis.fetch,
        resources.abortController.signal,
      );
      if (!isCurrent(generation)) {
        closeResources(resources);
        return;
      }
      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: answer,
      });
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
          : "Failed to start Foundry Realtime voice demo.",
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
    guardrailStatus,
    sessionModel,
    start,
    status,
    stop,
    transcript,
  };
}
