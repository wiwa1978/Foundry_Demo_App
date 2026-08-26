import { useCallback, useEffect, useRef, useState } from "react";

import { voiceLiveAvatarUrl } from "@/features/voice/api";
import type {
  RealtimeStatus,
  RealtimeTranscriptEntry,
  VoiceLiveAvatarStatus,
  VoiceLiveServerEvent,
} from "@/features/voice/types";

export const voiceLiveTravelInstructions =
  "You are Ava, a multilingual travel concierge. Help travelers plan practical trips through natural spoken conversation. Ask one focused question at a time about destination, dates, budget, interests, and accessibility needs. Reply in the language used by the traveler. Never claim that a booking is confirmed; clearly label suggestions and summarize the proposed itinerary before ending.";
export const liveChatAvatarInstructions =
  "You are Ava, a friendly general-purpose conversational assistant. Have natural, helpful spoken conversations about the user's questions, ideas, and everyday tasks. Ask clarifying questions when useful, keep responses concise enough for a live conversation, and reply in the language used by the user. Do not pretend to have completed actions you cannot perform.";

const iceGatheringTimeoutMs = 3000;
const defaultStandardVoice = "en-US-Ava:DragonHDLatestNeural";
const defaultRealtimeNativeVoice = "ava";
const voiceLiveInputSampleRate = 16000;

function buildVoiceLiveVoiceConfig(model: string, voice: string) {
  const normalizedModel = model.trim().toLowerCase();
  const normalizedVoice = voice.trim();
  if (normalizedModel === "azure-realtime") {
    return {
      type: "azure-realtime-native",
      name: normalizedVoice || defaultRealtimeNativeVoice,
    };
  }
  return {
    type: "azure-standard",
    name: normalizedVoice || defaultStandardVoice,
    temperature: 0.8,
  };
}

function buildVoiceLiveInputAudioTranscription(model: string) {
  const normalizedModel = model.trim().toLowerCase();
  if (normalizedModel === "azure-realtime") return undefined;
  if (
    normalizedModel === "gpt-realtime" ||
    normalizedModel === "gpt-realtime-mini"
  ) {
    return { model: "gpt-4o-mini-transcribe" };
  }
  return { model: "azure-speech" };
}

function encodeBase64(data: ArrayBuffer | ArrayBufferView) {
  const bytes =
    data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeSessionDescription(value: string): RTCSessionDescriptionInit {
  return JSON.parse(atob(value)) as RTCSessionDescriptionInit;
}

type VoiceLiveResources = {
  abortController: AbortController;
  audioContext: AudioContext | null;
  avatarPeerConnection: RTCPeerConnection | null;
  mediaStream: MediaStream | null;
  silentOutput: GainNode | null;
  socket: WebSocket | null;
  source: MediaStreamAudioSourceNode | null;
  worklet: AudioWorkletNode | null;
  closed: boolean;
};

export function useVoiceLive({
  model,
  voice,
  instructions = voiceLiveTravelInstructions,
}: {
  model: string;
  voice: string;
  instructions?: string;
}) {
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [error, setError] = useState("");
  const [avatarStatus, setAvatarStatus] =
    useState<VoiceLiveAvatarStatus>("idle");
  const [avatarError, setAvatarError] = useState("");
  const [transcript, setTranscript] = useState<RealtimeTranscriptEntry[]>([]);
  const avatarAudioRef = useRef<HTMLAudioElement | null>(null);
  const avatarVideoRef = useRef<HTMLVideoElement | null>(null);
  const mountedRef = useRef(true);
  const statusRef = useRef<RealtimeStatus>("idle");
  const generationRef = useRef(0);
  const transcriptSequenceRef = useRef(0);
  const assistantStreamingRef = useRef(false);
  const resourcesRef = useRef<VoiceLiveResources | null>(null);

  function updateStatus(nextStatus: RealtimeStatus) {
    statusRef.current = nextStatus;
    if (mountedRef.current) setStatus(nextStatus);
  }

  function isCurrent(generation: number) {
    return mountedRef.current && generationRef.current === generation;
  }

  const clearAvatarElements = useCallback(() => {
    if (avatarVideoRef.current) avatarVideoRef.current.srcObject = null;
    if (avatarAudioRef.current) avatarAudioRef.current.srcObject = null;
  }, []);

  const closeResources = useCallback(
    (resources: VoiceLiveResources | null) => {
      if (!resources || resources.closed) return;
      resources.closed = true;
      resources.abortController.abort();
      resources.socket?.close();
      resources.worklet?.disconnect();
      resources.source?.disconnect();
      resources.silentOutput?.disconnect();
      resources.mediaStream?.getTracks().forEach((track) => track.stop());
      resources.avatarPeerConnection?.close();
      if (resources.audioContext?.state !== "closed") {
        void resources.audioContext?.close();
      }
      clearAvatarElements();
    },
    [clearAvatarElements],
  );

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
    setTranscript((current) => [...current, entry].slice(-12));
  }

  function appendAssistantDelta(text: string, generation: number) {
    const cleaned = text.trim();
    if (!cleaned || !isCurrent(generation)) return;
    assistantStreamingRef.current = true;
    setTranscript((current) => {
      const last = current.at(-1);
      if (!last || last.source !== "assistant") {
        transcriptSequenceRef.current += 1;
        return [
          ...current,
          {
            id: `voice-live-${transcriptSequenceRef.current}`,
            source: "assistant" as const,
            text: cleaned,
          },
        ].slice(-12);
      }
      const needsSpace =
        !last.text.endsWith(" ") && !/^[,.;!?%:)\]}]/.test(cleaned);
      return [
        ...current.slice(0, -1),
        { ...last, text: `${last.text}${needsSpace ? " " : ""}${cleaned}` },
      ];
    });
  }

  function appendAssistantFinal(text: string, generation: number) {
    if (!assistantStreamingRef.current) {
      appendTranscript("assistant", text, generation);
      return;
    }
    const cleaned = text.trim();
    assistantStreamingRef.current = false;
    if (!cleaned || !isCurrent(generation)) return;
    setTranscript((current) => {
      const last = current.at(-1);
      if (!last || last.source !== "assistant") return current;
      return [...current.slice(0, -1), { ...last, text: cleaned }];
    });
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
      (event.transcript || event.text)
    ) {
      appendAssistantFinal(event.transcript ?? event.text ?? "", generation);
    } else if (
      (event.type === "response.audio_transcript.delta" ||
        event.type === "response.text.delta") &&
      (event.delta || event.text)
    ) {
      appendAssistantDelta(event.delta ?? event.text ?? "", generation);
    } else if (event.type === "input_audio_buffer.speech_started") {
      appendTranscript(
        "system",
        "Listening - interrupt at any time",
        generation,
      );
    } else if (event.type === "session.avatar.switch_to_speaking") {
      setAvatarStatus("speaking");
    } else if (event.type === "session.avatar.switch_to_idle") {
      setAvatarStatus("ready");
    } else if (event.type === "error" || event.type === "rtc.call.error") {
      setError(event.error?.message ?? "Voice Live reported an error.");
    }
  }

  const closeCurrentResources = useCallback(() => {
    generationRef.current += 1;
    const resources = resourcesRef.current;
    resourcesRef.current = null;
    closeResources(resources);
    setAvatarStatus("idle");
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
    setAvatarStatus("unavailable");
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
      const timeoutId = window.setTimeout(
        () => resolveReady(),
        iceGatheringTimeoutMs,
      );
      const cleanup = () => {
        peerConnection.removeEventListener("icegatheringstatechange", onChange);
        resources.abortController.signal.removeEventListener("abort", onAbort);
        window.clearTimeout(timeoutId);
      };
      const resolveReady = () => {
        cleanup();
        resolve();
      };
      const onChange = () => {
        if (peerConnection.iceGatheringState !== "complete") return;
        resolveReady();
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
      const onError = () => rejectWith("Voice Live avatar channel failed.");
      const onClose = () => rejectWith("Voice Live avatar channel closed.");
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

  async function connectAvatar(
    generation: number,
    resources: VoiceLiveResources,
    socket: WebSocket,
    iceServers?: RTCIceServer[],
  ) {
    if (!isCurrent(generation) || resources.avatarPeerConnection) return;
    setAvatarStatus("connecting");
    setAvatarError("");

    const peerConnection = new RTCPeerConnection({
      iceServers: iceServers?.length ? iceServers : undefined,
    });
    resources.avatarPeerConnection = peerConnection;

    peerConnection.addTransceiver("video", { direction: "recvonly" });
    peerConnection.addTransceiver("audio", { direction: "recvonly" });

    peerConnection.ontrack = (event) => {
      if (!isCurrent(generation)) return;
      const [stream] = event.streams;
      if (!stream) return;
      if (event.track.kind === "video" && avatarVideoRef.current) {
        avatarVideoRef.current.srcObject = stream;
        void avatarVideoRef.current.play();
        setAvatarStatus((current) =>
          current === "speaking" ? "speaking" : "ready",
        );
      }
      if (event.track.kind === "audio" && avatarAudioRef.current) {
        avatarAudioRef.current.srcObject = stream;
        void avatarAudioRef.current.play();
      }
    };
    peerConnection.onconnectionstatechange = () => {
      if (!isCurrent(generation)) return;
      if (peerConnection.connectionState === "failed") {
        setAvatarStatus("unavailable");
        setAvatarError("Avatar WebRTC connection failed.");
      }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await waitForIceGathering(generation, resources, peerConnection);
    if (!isCurrent(generation) || !peerConnection.localDescription) return;
    socket.send(
      JSON.stringify({
        type: "session.avatar.connect",
        client_sdp: btoa(JSON.stringify(peerConnection.localDescription)),
      }),
    );
  }

  async function start() {
    if (statusRef.current !== "idle") {
      stop();
      return;
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      !window.AudioWorkletNode ||
      !window.RTCPeerConnection ||
      !window.WebSocket
    ) {
      setError(
        "This browser does not support the audio and WebRTC APIs required for Voice Live avatars.",
      );
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const resources: VoiceLiveResources = {
      abortController: new AbortController(),
      audioContext: null,
      avatarPeerConnection: null,
      mediaStream: null,
      silentOutput: null,
      socket: null,
      source: null,
      worklet: null,
      closed: false,
    };
    resourcesRef.current = resources;
    updateStatus("connecting");
    setAvatarStatus("connecting");
    setAvatarError("");
    setError("");
    setTranscript([]);
    assistantStreamingRef.current = false;
    clearAvatarElements();

    try {
      const context = new AudioContext();
      resources.audioContext = context;
      await context.audioWorklet.addModule(
        new URL("../../live-interpreter-worklet.js", import.meta.url),
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
      resources.source = context.createMediaStreamSource(resources.mediaStream);
      resources.worklet = new AudioWorkletNode(
        context,
        "live-interpreter-processor",
      );

      const socket = new WebSocket(voiceLiveAvatarUrl(), "realtime");
      resources.socket = socket;
      let avatarConnectStarted = false;

      socket.addEventListener("message", (message) => {
        if (!isCurrent(generation)) return;
        try {
          const event = JSON.parse(
            String(message.data),
          ) as VoiceLiveServerEvent;
          handleEvent(generation, event);
          if (event.type === "session.updated" && !avatarConnectStarted) {
            avatarConnectStarted = true;
            const avatar = event.session?.avatar;
            const iceServers = avatar?.ice_servers ?? avatar?.iceServers;
            void connectAvatar(generation, resources, socket, iceServers).catch(
              (caught: unknown) => {
                if (!isCurrent(generation)) return;
                if (
                  caught instanceof DOMException &&
                  caught.name === "AbortError"
                ) {
                  return;
                }
                setAvatarStatus("unavailable");
                setAvatarError(
                  caught instanceof Error
                    ? caught.message
                    : "Avatar WebRTC connection failed.",
                );
              },
            );
          }
          if (
            event.type === "session.avatar.connecting" &&
            event.server_sdp &&
            resources.avatarPeerConnection
          ) {
            void resources.avatarPeerConnection
              .setRemoteDescription(decodeSessionDescription(event.server_sdp))
              .then(() => setAvatarStatus("ready"));
          }
          if (event.type === "error") {
            failSession(
              generation,
              resources,
              event.error?.message ?? "Voice Live reported an error.",
            );
          }
        } catch {
          failSession(
            generation,
            resources,
            "Received an unreadable Voice Live event.",
          );
        }
      });
      socket.addEventListener("error", () => {
        failSession(generation, resources, "Voice Live avatar channel failed.");
      });
      socket.addEventListener("close", () => {
        if (!resources.closed) {
          failSession(
            generation,
            resources,
            "Voice Live avatar channel closed.",
          );
        }
      });

      await waitForSocketOpen(resources, socket);
      if (!isCurrent(generation) || !resources.worklet || !resources.source) {
        closeResources(resources);
        return;
      }

      const inputAudioTranscription =
        buildVoiceLiveInputAudioTranscription(model);
      socket.send(
        JSON.stringify({
          type: "session.update",
          session: {
            modalities: ["text", "audio"],
            instructions,
            input_audio_format: "pcm16",
            input_audio_sampling_rate: voiceLiveInputSampleRate,
            voice: buildVoiceLiveVoiceConfig(model, voice),
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
            avatar: {
              character: "lisa",
              style: "casual-sitting",
              customized: false,
              output_protocol: "webrtc",
              video: {
                bitrate: 1000000,
                codec: "h264",
                resolution: { width: 1920, height: 1080 },
                crop: {
                  top_left: [560, 0],
                  bottom_right: [1360, 1080],
                },
              },
            },
            ...(inputAudioTranscription && {
              input_audio_transcription: inputAudioTranscription,
            }),
          },
        }),
      );

      resources.worklet.port.onmessage = (
        message: MessageEvent<ArrayBuffer>,
      ) => {
        if (isCurrent(generation) && socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: encodeBase64(message.data),
            }),
          );
        }
      };
      resources.source.connect(resources.worklet);
      resources.silentOutput = context.createGain();
      resources.silentOutput.gain.value = 0;
      resources.worklet
        .connect(resources.silentOutput)
        .connect(context.destination);
      updateStatus("live");
      appendTranscript(
        "system",
        `Connected to Voice Live avatar (${model})`,
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
      setAvatarStatus("unavailable");
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to start Voice Live avatar.",
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
    avatar: {
      audioRef: avatarAudioRef,
      error: avatarError,
      status: avatarStatus,
      videoRef: avatarVideoRef,
    },
    error,
    start,
    status,
    stop,
    transcript,
  };
}
