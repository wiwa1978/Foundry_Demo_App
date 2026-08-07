import { useCallback, useEffect, useRef, useState } from "react";

import { voiceLiveUrl } from "@/features/voice/api";
import {
  closeRemoteAudio,
  stopMediaTracks,
} from "@/features/voice/mediaSessionUtils";
import type {
  RealtimeStatus,
  RealtimeTranscriptEntry,
  VoiceLiveServerEvent,
} from "@/features/voice/types";

const voiceLiveInstructions =
  "You are Ava, a multilingual travel concierge. Help travelers plan practical trips through natural spoken conversation. Ask one focused question at a time about destination, dates, budget, interests, and accessibility needs. Reply in the language used by the traveler. Never claim that a booking is confirmed; clearly label suggestions and summarize the proposed itinerary before ending.";

type VoiceLiveResources = {
  abortController: AbortController;
  audio: HTMLAudioElement | null;
  dataChannel: RTCDataChannel | null;
  mediaStream: MediaStream | null;
  peerConnection: RTCPeerConnection | null;
  socket: WebSocket | null;
  closed: boolean;
};

export function useVoiceLive({
  model,
  voice,
}: {
  model: string;
  voice: string;
}) {
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState<RealtimeTranscriptEntry[]>([]);
  const mountedRef = useRef(true);
  const statusRef = useRef<RealtimeStatus>("idle");
  const generationRef = useRef(0);
  const transcriptSequenceRef = useRef(0);
  const resourcesRef = useRef<VoiceLiveResources | null>(null);

  function updateStatus(nextStatus: RealtimeStatus) {
    statusRef.current = nextStatus;
    if (mountedRef.current) setStatus(nextStatus);
  }

  function isCurrent(generation: number) {
    return mountedRef.current && generationRef.current === generation;
  }

  const closeResources = useCallback((resources: VoiceLiveResources | null) => {
    if (!resources || resources.closed) return;
    resources.closed = true;
    resources.abortController.abort();
    resources.dataChannel?.close();
    resources.socket?.close();
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
      id: `voice-live-${transcriptSequenceRef.current}`,
      source,
      text: cleaned,
    };
    setTranscript((current) => [...current, entry].slice(-8));
  }

  function handleEvent(generation: number, event: VoiceLiveServerEvent) {
    if (!isCurrent(generation)) return;
    if (
      event.type === "conversation.item.input_audio_transcription.completed" &&
      event.transcript
    ) {
      appendTranscript("user", event.transcript, generation);
    } else if (
      (event.type === "response.audio_transcript.done" ||
        event.type === "response.text.done") &&
      event.transcript
    ) {
      appendTranscript("assistant", event.transcript, generation);
    } else if (event.type === "input_audio_buffer.speech_started") {
      appendTranscript(
        "system",
        "Listening - interrupt at any time",
        generation,
      );
    } else if (event.type === "error" || event.type === "rtc.call.error") {
      setError(event.error?.message ?? "Voice Live reported an error.");
    }
  }

  const closeCurrentResources = useCallback(() => {
    generationRef.current += 1;
    const resources = resourcesRef.current;
    resourcesRef.current = null;
    closeResources(resources);
  }, [closeResources]);

  function failSession(
    generation: number,
    resources: VoiceLiveResources,
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
    if (mountedRef.current)
      appendTranscript("system", "Voice Live session stopped");
  }

  function waitForIceGathering(
    generation: number,
    resources: VoiceLiveResources,
    peerConnection: RTCPeerConnection,
  ) {
    if (peerConnection.iceGatheringState === "complete")
      return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        peerConnection.removeEventListener("icegatheringstatechange", onChange);
        resources.abortController.signal.removeEventListener("abort", onAbort);
      };
      const onChange = () => {
        if (peerConnection.iceGatheringState !== "complete") return;
        cleanup();
        resolve();
      };
      const onAbort = () => {
        cleanup();
        reject(new DOMException("The operation was aborted.", "AbortError"));
      };
      peerConnection.addEventListener("icegatheringstatechange", onChange);
      resources.abortController.signal.addEventListener("abort", onAbort, {
        once: true,
      });
      if (!isCurrent(generation)) onAbort();
    });
  }

  function waitForSocketOpen(resources: VoiceLiveResources, socket: WebSocket) {
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
      const onError = () => rejectWith("Voice Live control channel failed.");
      const onClose = () => rejectWith("Voice Live control channel closed.");
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
      !window.RTCPeerConnection ||
      !window.WebSocket
    ) {
      setError(
        "This browser does not support the WebRTC APIs required for Voice Live.",
      );
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const resources: VoiceLiveResources = {
      abortController: new AbortController(),
      audio: null,
      dataChannel: null,
      mediaStream: null,
      peerConnection: null,
      socket: null,
      closed: false,
    };
    resourcesRef.current = resources;
    updateStatus("connecting");
    setError("");
    setTranscript([]);

    try {
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
      peerConnection.onconnectionstatechange = () => {
        if (!isCurrent(generation)) return;
        if (peerConnection.connectionState === "connected")
          updateStatus("live");
        if (peerConnection.connectionState === "failed") {
          setError("Voice Live WebRTC connection failed.");
          stop();
        }
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (!isCurrent(generation)) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }
      resources.mediaStream = mediaStream;
      resources.mediaStream
        .getTracks()
        .forEach((track) =>
          peerConnection.addTrack(track, resources.mediaStream as MediaStream),
        );
      const dataChannel = peerConnection.createDataChannel("voice-live-events");
      resources.dataChannel = dataChannel;
      dataChannel.addEventListener("message", (message) => {
        if (!isCurrent(generation)) return;
        try {
          const event = JSON.parse(
            String(message.data),
          ) as VoiceLiveServerEvent;
          handleEvent(generation, event);
          if (event.type === "error" || event.type === "rtc.call.error") {
            failSession(
              generation,
              resources,
              event.error?.message ?? "Voice Live reported an error.",
            );
          }
        } catch {
          // Voice Live can send non-JSON data-channel events.
        }
      });
      dataChannel.addEventListener("error", () => {
        failSession(generation, resources, "Voice Live data channel failed.");
      });
      dataChannel.addEventListener("close", () => {
        failSession(generation, resources, "Voice Live data channel closed.");
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await waitForIceGathering(generation, resources, peerConnection);
      if (!isCurrent(generation)) {
        closeResources(resources);
        return;
      }
      if (!peerConnection.localDescription?.sdp) {
        throw new Error("Browser did not create a Voice Live SDP offer.");
      }

      const socket = new WebSocket(voiceLiveUrl(), "realtime");
      resources.socket = socket;
      await waitForSocketOpen(resources, socket);
      if (!isCurrent(generation)) {
        closeResources(resources);
        return;
      }

      const answer = new Promise<string>((resolve, reject) => {
        const onAbort = () =>
          reject(new DOMException("The operation was aborted.", "AbortError"));
        const failControlChannel = (message: string) => {
          resources.abortController.signal.removeEventListener(
            "abort",
            onAbort,
          );
          failSession(generation, resources, message);
          reject(new Error(message));
        };
        resources.abortController.signal.addEventListener("abort", onAbort, {
          once: true,
        });
        socket.addEventListener("message", (message) => {
          if (!isCurrent(generation)) return;
          try {
            const event = JSON.parse(
              String(message.data),
            ) as VoiceLiveServerEvent;
            handleEvent(generation, event);
            if (event.type === "rtc.call.sdp.created" && event.sdp_answer) {
              resources.abortController.signal.removeEventListener(
                "abort",
                onAbort,
              );
              resolve(event.sdp_answer);
            }
            if (event.type === "error" || event.type === "rtc.call.error") {
              failControlChannel(
                event.error?.message ?? "Voice Live call failed.",
              );
            }
          } catch {
            failControlChannel("Received an unreadable Voice Live event.");
          }
        });
        socket.addEventListener("error", () => {
          failControlChannel("Voice Live control channel failed.");
        });
        socket.addEventListener("close", () => {
          failControlChannel("Voice Live control channel closed.");
        });
      });
      socket.send(
        JSON.stringify({
          type: "rtc.call.sdp.create",
          sdp_offer: peerConnection.localDescription.sdp,
          session: {
            modalities: ["text", "audio"],
            instructions: voiceLiveInstructions,
            voice: { type: "azure-standard", name: voice, temperature: 0.8 },
            turn_detection: {
              type: "azure_semantic_vad_multilingual",
              remove_filler_words: true,
              interrupt_response: true,
              create_response: true,
            },
            input_audio_noise_reduction: {
              type: "azure_deep_noise_suppression",
            },
            input_audio_echo_cancellation: { type: "server_echo_cancellation" },
          },
        }),
      );
      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: await answer,
      });
      if (!isCurrent(generation)) {
        closeResources(resources);
        return;
      }
      appendTranscript(
        "system",
        `Connected to Voice Live (${model})`,
        generation,
      );
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
          : "Failed to start Voice Live.",
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

  return { error, start, status, stop, transcript };
}
